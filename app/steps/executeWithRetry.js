"use strict";

var buildProxyReq = require("./buildProxyReq");
var copyProxyResHeadersToUserRes = require("./copyProxyResHeadersToUserRes");
var decorateProxyReqBody = require("./decorateProxyReqBody");
var decorateProxyReqOpts = require("./decorateProxyReqOpts");
var decorateUserRes = require("./decorateUserRes");
var prepareProxyReq = require("./prepareProxyReq");
var resolveProxyHost = require("./resolveProxyHost");
var resolveProxyReqPath = require("./resolveProxyReqPath");
var sendProxyRequest = require("./sendProxyRequest");
var sendUserRes = require("./sendUserRes");
var ScopeContainer = require("../../lib/scopeContainer");

// Maximum body size to cache for retries (default: 20MB)
// Beyond this size, retries will be disabled to prevent OOM
var MAX_CACHEABLE_BODY_SIZE = 20 * 1024 * 1024; // 20MB

function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function executeProxySteps(container) {
  return buildProxyReq(container)
    .then(resolveProxyHost)
    .then(decorateProxyReqOpts)
    .then(resolveProxyReqPath)
    .then(decorateProxyReqBody)
    .then(prepareProxyReq)
    .then(sendProxyRequest)
    .then(copyProxyResHeadersToUserRes)
    .then(decorateUserRes)
    .then(sendUserRes);
}

function shouldRetryOnError(error) {
  // Default retry condition: retry on network errors, timeout errors, and 5xx status codes
  return (
    error.code === "ECONNRESET" ||
    error.code === "ECONNREFUSED" ||
    error.code === "ETIMEDOUT" ||
    error.code === "ENOTFOUND" ||
    (error.status && error.status >= 500)
  );
}

function shouldRetryOnResponse(container) {
  // Default condition: don't retry on successful responses
  var statusCode = container.proxy.res ? container.proxy.res.statusCode : 0;
  return statusCode >= 500;
}

function calculateRetryDelay(attempt, config) {
  // Calculate delay with exponential backoff
  var baseDelay = config.minTimeout;
  var exponentialDelay = baseDelay * Math.pow(2, attempt);

  // Apply jitter (random factor between 0.1 and 1)
  var jitter = 0.1 + Math.random() * 0.9;
  var delay = exponentialDelay * jitter;

  // Ensure delay doesn't exceed maxTimeout
  return Math.min(delay, config.maxTimeout);
}

function getBodySize(bodyContent) {
  if (!bodyContent) return 0;
  if (Buffer.isBuffer(bodyContent)) return bodyContent.length;
  if (typeof bodyContent === "string") return Buffer.byteLength(bodyContent);
  if (typeof bodyContent === "object") {
    try {
      return Buffer.byteLength(JSON.stringify(bodyContent));
    } catch (e) {
      return 0;
    }
  }
  return 0;
}

function shouldCacheBody(bodyContent) {
  var bodySize = getBodySize(bodyContent);
  return bodySize <= MAX_CACHEABLE_BODY_SIZE;
}

function createContainerWithCachedBody(originalContainer, cachedBody) {
  // Create a fresh container for retry with cached body to avoid stream reuse issues
  var freshContainer = new ScopeContainer(
    originalContainer.user.ctx,
    originalContainer.params.host,
    originalContainer.params.userOptions,
  );

  // If we have cached body content, set it on the fresh container
  if (cachedBody !== undefined) {
    // Store the cached body in the request context so it won't try to read the stream again
    freshContainer.user.ctx.request.body = cachedBody;
  }

  return freshContainer;
}

function executeWithBuiltinRetry(container) {
  var retryConfig = container.options.retry;
  var ctx = container.user.ctx;
  var startTime = Date.now();
  var cachedBody = undefined;
  var canCache = true; // Flag to track if we can cache body

  function attemptRequest(attempt) {
    // Use fresh container for retries to avoid stream reuse issues
    var currentContainer =
      attempt === 0
        ? container
        : createContainerWithCachedBody(container, cachedBody);

    return executeProxySteps(currentContainer)
      .then(function (result) {
        // Cache the body content from the first successful attempt (if not too large)
        if (attempt === 0 && result.proxy.bodyContent && canCache) {
          if (shouldCacheBody(result.proxy.bodyContent)) {
            cachedBody = result.proxy.bodyContent;
          } else {
            // Body too large to cache - disable retries for safety
            canCache = false;
            console.warn(
              "[koa-http-proxy] Body size exceeds cache limit (" +
                Math.round(
                  getBodySize(result.proxy.bodyContent) / 1024 / 1024,
                ) +
                "MB > " +
                Math.round(MAX_CACHEABLE_BODY_SIZE / 1024 / 1024) +
                "MB). Retries disabled to prevent OOM.",
            );
          }
        }

        // Don't retry if we can't cache (large body)
        if (!canCache) {
          return result;
        }

        // Check if we should retry based on response
        var elapsedTime = Date.now() - startTime;

        // If response indicates we should retry and we haven't exceeded limits
        if (
          shouldRetryOnResponse(result) &&
          attempt < retryConfig.retries &&
          elapsedTime < retryConfig.maxRetryTime
        ) {
          var delayMs = calculateRetryDelay(attempt, retryConfig);
          var remainingTime = retryConfig.maxRetryTime - elapsedTime;

          if (delayMs < remainingTime) {
            return delay(delayMs).then(function () {
              return attemptRequest(attempt + 1);
            });
          }
        }

        return result;
      })
      .catch(function (error) {
        // Don't retry if we can't cache (large body)
        if (!canCache) {
          throw error;
        }

        // Check if we've exceeded max retry time
        var elapsedTime = Date.now() - startTime;
        if (elapsedTime >= retryConfig.maxRetryTime) {
          throw error;
        }

        // Check if we've exceeded max retry attempts
        if (attempt >= retryConfig.retries) {
          throw error;
        }

        // Check if this error should be retried
        if (!shouldRetryOnError(error)) {
          throw error;
        }

        // Calculate delay for this attempt
        var delayMs = calculateRetryDelay(attempt, retryConfig);

        // Ensure we don't exceed maxRetryTime with the delay
        var remainingTime = retryConfig.maxRetryTime - elapsedTime;
        if (delayMs >= remainingTime) {
          throw error;
        }

        // Wait before retrying
        return delay(delayMs).then(function () {
          return attemptRequest(attempt + 1);
        });
      });
  }

  return attemptRequest(0);
}

function executeWithRetry(container) {
  var retryConfig = container.options.retry;
  var ctx = container.user.ctx;

  // If retry is disabled, execute normally
  if (!retryConfig.enabled) {
    return executeProxySteps(container);
  }

  // If parseReqBody is false (streaming mode), disable retry for safety
  if (!container.options.parseReqBody) {
    console.log(
      "[koa-http-proxy] Streaming mode detected (parseReqBody: false). Retry disabled for stream safety.",
    );
    return executeProxySteps(container);
  }

  // If custom retry handler is provided, use it
  if (retryConfig.customHandler) {
    var cachedBody = undefined;
    var isFirstCall = true;
    var canCache = true;

    // Create a simple handle function that user can call multiple times
    var handle = function () {
      var currentContainer;

      if (isFirstCall) {
        // First call: use original container and cache the body
        isFirstCall = false;
        currentContainer = container;

        return executeProxySteps(currentContainer).then(function (result) {
          // Cache the body content for subsequent calls (if not too large)
          if (result.proxy.bodyContent && canCache) {
            if (shouldCacheBody(result.proxy.bodyContent)) {
              cachedBody = result.proxy.bodyContent;
            } else {
              // Body too large to cache - warn user but allow continued execution
              canCache = false;
              console.warn(
                "[koa-http-proxy] Body size exceeds cache limit (" +
                  Math.round(
                    getBodySize(result.proxy.bodyContent) / 1024 / 1024,
                  ) +
                  "MB > " +
                  Math.round(MAX_CACHEABLE_BODY_SIZE / 1024 / 1024) +
                  "MB). " +
                  "Subsequent retry calls may fail due to stream reuse. " +
                  "Consider disabling retry for large uploads.",
              );
            }
          }
          return result;
        });
      } else {
        // Subsequent calls: use fresh container with cached body
        if (!canCache) {
          // Cannot safely retry due to large body
          throw new Error(
            "[koa-http-proxy] Cannot retry: body too large to cache safely. " +
              "Disable retry for large file uploads to prevent this error.",
          );
        }
        currentContainer = createContainerWithCachedBody(container, cachedBody);
        return executeProxySteps(currentContainer);
      }
    };

    // Call the custom retry function with the simple handle API
    var result = retryConfig.customHandler(handle, ctx);

    // Ensure it returns a Promise
    if (!result || typeof result.then !== "function") {
      return Promise.resolve(result);
    }

    return result;
  }

  // Use built-in retry logic
  return executeWithBuiltinRetry(container);
}

module.exports = executeWithRetry;
