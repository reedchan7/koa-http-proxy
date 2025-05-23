"use strict";

var isUnset = require("../lib/isUnset");

function resolveBodyEncoding(reqBodyEncoding) {
  /* For reqBodyEncoding, these is a meaningful difference between null and
   * undefined.  null should be passed forward as the value of reqBodyEncoding,
   * and undefined should result in utf-8.
   */
  return reqBodyEncoding !== undefined ? reqBodyEncoding : "utf-8";
}

function defaultFilter() {
  // No-op version of filter.  Allows everything!
  return true;
}

function resolveRetryConfig(retry) {
  // If retry is disabled or not provided
  if (!retry) {
    return {
      enabled: false,
      retries: 0,
      maxRetryTime: Infinity,
      minTimeout: 1000,
      maxTimeout: Infinity,
      customHandler: null,
    };
  }

  // If retry is a custom function
  if (typeof retry === "function") {
    return {
      enabled: true,
      customHandler: retry,
      retries: 0,
      maxRetryTime: Infinity,
      minTimeout: 1000,
      maxTimeout: Infinity,
    };
  }

  // If retry is true, use default configuration
  if (retry === true) {
    return {
      enabled: true,
      retries: 3,
      maxRetryTime: Infinity,
      minTimeout: 1000,
      maxTimeout: Infinity,
      customHandler: null,
    };
  }

  // If retry is a configuration object
  if (typeof retry === "object") {
    return {
      enabled: true,
      retries:
        typeof retry.retries === "number" ? Math.max(0, retry.retries) : 3,
      maxRetryTime:
        typeof retry.maxRetryTime === "number"
          ? Math.max(0, retry.maxRetryTime)
          : Infinity,
      minTimeout:
        typeof retry.minTimeout === "number"
          ? Math.max(0, retry.minTimeout)
          : 1000,
      maxTimeout:
        typeof retry.maxTimeout === "number"
          ? Math.max(0, retry.maxTimeout)
          : Infinity,
      customHandler: null,
    };
  }

  // Fallback to disabled
  return {
    enabled: false,
    retries: 0,
    maxRetryTime: Infinity,
    minTimeout: 1000,
    maxTimeout: Infinity,
    customHandler: null,
  };
}

function resolveOptions(options) {
  // resolve user argument to program usable options
  options = options || {};

  return {
    agent: options.agent,
    proxyReqPathResolver: options.proxyReqPathResolver,
    proxyReqOptDecorator: options.proxyReqOptDecorator,
    proxyReqBodyDecorator: options.proxyReqBodyDecorator,
    userResDecorator: options.userResDecorator,
    userResHeadersDecorator: options.userResHeadersDecorator,
    filter: options.filter || defaultFilter,
    // For backwards compatability, we default to legacy behavior for newly added settings.
    parseReqBody: isUnset(options.parseReqBody) ? true : options.parseReqBody,
    reqBodyEncoding: resolveBodyEncoding(options.reqBodyEncoding),
    headers: { ...(options.headers || {}) },
    strippedHeaders: options.strippedHeaders,
    preserveReqSession: options.preserveReqSession,
    https: options.https,
    port: options.port,
    reqAsBuffer: options.reqAsBuffer,
    connectTimeout: options.connectTimeout,
    timeout: options.timeout,
    limit: options.limit,
    // Retry configuration
    retry: resolveRetryConfig(options.retry),
  };
}

module.exports = resolveOptions;
