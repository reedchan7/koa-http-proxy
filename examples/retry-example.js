var Koa = require("koa");
var proxy = require("../");

var app = new Koa();

// Example 1: Simple retry with default settings
app.use(
  proxy("https://api.unreliable-service.com", {
    // Enable retry with default configuration:
    // - retries: 3
    // - maxRetryTime: Infinity
    // - minTimeout: 1000ms
    // - maxTimeout: Infinity
    retry: true,
  }),
);

// Example 2: Custom retry configuration
app.use(
  proxy("https://api.example.com", {
    retry: {
      retries: 5, // Maximum 5 retry attempts
      maxRetryTime: 30000, // Stop retrying after 30 seconds total
      minTimeout: 500, // Start with 500ms delay
      maxTimeout: 5000, // Cap delay at 5 seconds
    },
  }),
);

// Example 3: Advanced retry configuration with shorter timeouts
app.use(
  proxy("https://api.fast-service.com", {
    retry: {
      retries: 2, // Quick retry for fast services
      maxRetryTime: 5000, // 5 second total timeout
      minTimeout: 100, // Start with 100ms
      maxTimeout: 1000, // Max 1 second between retries
    },
  }),
);

// Example 4: Custom retry logic with full control
app.use(
  proxy("https://api.custom-logic.com", {
    retry: function (executeHandler, ctx) {
      console.log(`Custom retry handler for ${ctx.method} ${ctx.url}`);

      // Custom logic: don't retry POST requests to avoid duplicates
      if (ctx.method === "POST") {
        return executeHandler();
      }

      // For GET requests, implement custom retry with exponential backoff
      var maxAttempts = 3;
      var attempt = 0;

      function tryRequest() {
        return executeHandler().catch(function (error) {
          attempt++;

          // Don't retry client errors (4xx)
          if (error.status && error.status >= 400 && error.status < 500) {
            throw error;
          }

          // Don't retry if we've reached max attempts
          if (attempt >= maxAttempts) {
            console.log(`Failed after ${attempt} attempts: ${error.message}`);
            throw error;
          }

          // Calculate delay with exponential backoff
          var delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          console.log(`Retrying in ${delay}ms (attempt ${attempt})`);

          return new Promise(function (resolve, reject) {
            setTimeout(function () {
              tryRequest().then(resolve).catch(reject);
            }, delay);
          });
        });
      }

      return tryRequest();
    },
  }),
);

// Example 5: Circuit breaker pattern with custom retry
app.use(
  proxy("https://api.circuit-breaker.com", {
    retry: function (executeHandler, ctx) {
      // Simple circuit breaker: track failures
      var circuitBreakerKey = "circuit_" + ctx.hostname;
      var failures = global[circuitBreakerKey] || 0;

      // If too many failures, fail fast
      if (failures >= 5) {
        console.log("Circuit breaker open, failing fast");
        return Promise.reject(new Error("Circuit breaker open"));
      }

      return executeHandler()
        .then(function (result) {
          // Reset on success
          global[circuitBreakerKey] = 0;
          return result;
        })
        .catch(function (error) {
          // Increment failure count
          global[circuitBreakerKey] = failures + 1;

          // Only retry if failures are low
          if (failures < 3) {
            console.log(`Retrying due to error (failures: ${failures + 1})`);
            return new Promise(function (resolve, reject) {
              setTimeout(function () {
                executeHandler().then(resolve).catch(reject);
              }, 1000);
            });
          }

          throw error;
        });
    },
  }),
);

// Example 6: Retry with external monitoring
app.use(
  proxy("https://api.monitored.com", {
    retry: function (executeHandler, ctx) {
      var startTime = Date.now();
      var attempt = 0;

      function logAttempt(error, success) {
        var duration = Date.now() - startTime;
        console.log(
          JSON.stringify({
            event: success ? "proxy_success" : "proxy_retry",
            attempt: attempt,
            url: ctx.url,
            method: ctx.method,
            duration: duration,
            error: error ? error.message : null,
            timestamp: new Date().toISOString(),
          }),
        );
      }

      function tryWithLogging() {
        attempt++;
        return executeHandler()
          .then(function (result) {
            logAttempt(null, true);
            return result;
          })
          .catch(function (error) {
            logAttempt(error, false);

            // Retry logic
            if (
              attempt < 3 &&
              (error.code === "ECONNRESET" || error.code === "ETIMEDOUT")
            ) {
              var delay = 1000 * attempt; // Linear backoff
              return new Promise(function (resolve, reject) {
                setTimeout(function () {
                  tryWithLogging().then(resolve).catch(reject);
                }, delay);
              });
            }

            throw error;
          });
      }

      return tryWithLogging();
    },
  }),
);

var port = process.env.PORT || 3000;
app.listen(port, function () {
  console.log(
    `Proxy server with new retry functionality running on port ${port}`,
  );
  console.log("Examples:");
  console.log("- retry: true (default settings)");
  console.log("- retry: { retries, maxRetryTime, minTimeout, maxTimeout }");
  console.log("- retry: function(executeHandler, ctx) { /* custom logic */ }");
});

module.exports = app;
