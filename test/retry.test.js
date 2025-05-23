"use strict";

var assert = require("assert");
var Koa = require("koa");
var agent = require("supertest").agent;
var proxy = require("../");
var proxyTarget = require("./support/proxyTarget");

describe("retry functionality", function () {
  this.timeout(30000);

  var other, http;

  beforeEach(function () {
    http = new Koa();
  });

  afterEach(function () {
    if (other) {
      other.close();
    }
  });

  describe("when retry is disabled (default)", function () {
    it("should not retry on failure when retry is not set", function (done) {
      http.use(proxy("http://localhost:9999"));

      agent(http.callback())
        .get("/")
        .end(function (err) {
          // Should get an error since the server doesn't exist
          assert(
            err,
            "Should get an error when connecting to non-existent server",
          );
          done();
        });
    });

    it("should not retry on failure when retry is false", function (done) {
      http.use(
        proxy("http://localhost:9999", {
          retry: false,
        }),
      );

      agent(http.callback())
        .get("/")
        .end(function (err) {
          // Should get an error since the server doesn't exist
          assert(
            err,
            "Should get an error when connecting to non-existent server",
          );
          done();
        });
    });
  });

  describe("when retry is enabled with default settings", function () {
    it("should retry with default configuration when retry is true", function (done) {
      var startTime = Date.now();

      http.use(
        proxy("http://127.0.0.1:6788", {
          retry: true,
        }),
      );

      agent(http.callback())
        .get("/")
        .end(function (err) {
          var elapsedTime = Date.now() - startTime;
          // Should take some time due to retries (at least 1 second for first retry)
          assert(elapsedTime >= 900, "Should take time for retries"); // Allow some tolerance
          // Should still get an error after retries
          assert(err, "Should get an error after all retries failed");
          done();
        });
    });
  });

  describe("when retry is configured with custom options", function () {
    it("should respect custom retry count", function (done) {
      var startTime = Date.now();

      http.use(
        proxy("http://localhost:9999", {
          retry: {
            retries: 2,
            minTimeout: 100,
            maxTimeout: 200,
          },
        }),
      );

      agent(http.callback())
        .get("/")
        .end(function (err) {
          var elapsedTime = Date.now() - startTime;
          // Should take some time but less than default (since we use shorter timeouts)
          assert(elapsedTime >= 100, "Should retry with configured delays");
          assert(
            elapsedTime < 2000,
            "Should not take too long with short timeouts",
          );
          assert(err, "Should get an error after retries");
          done();
        });
    });

    it("should respect maxRetryTime limit", function (done) {
      var startTime = Date.now();

      http.use(
        proxy("http://localhost:9999", {
          retry: {
            retries: 10, // High retry count
            maxRetryTime: 500, // But limited time
            minTimeout: 100,
            maxTimeout: 200,
          },
        }),
      );

      agent(http.callback())
        .get("/")
        .end(function (err) {
          var elapsedTime = Date.now() - startTime;
          // Should stop retrying due to maxRetryTime
          assert(
            elapsedTime < 800,
            "Should stop retrying due to maxRetryTime limit",
          );
          assert(err, "Should get an error after time limit");
          done();
        });
    });
  });

  describe("when retry is a custom function", function () {
    it("should use custom retry logic", function (done) {
      var customRetryCalled = false;
      var handlerCalled = false;

      http.use(
        proxy("http://localhost:9999", {
          retry: function (executeHandler, ctx) {
            customRetryCalled = true;
            assert(
              typeof executeHandler === "function",
              "Handler should be a function",
            );
            assert(ctx, "Context should be provided");

            // Custom retry logic: try once, wait 100ms, try again
            return executeHandler().catch(function (error) {
              handlerCalled = true;
              return new Promise(function (resolve, reject) {
                setTimeout(function () {
                  executeHandler().then(resolve).catch(reject);
                }, 100);
              });
            });
          },
        }),
      );

      agent(http.callback())
        .get("/")
        .end(function (err) {
          assert(customRetryCalled, "Custom retry function should be called");
          assert(handlerCalled, "Handler should be called in retry");
          assert(err, "Should still get an error after custom retry");
          done();
        });
    });
  });

  describe("when server succeeds", function () {
    it("should not retry on successful response", function (done) {
      other = proxyTarget(8080, 100, [
        {
          method: "get",
          path: "/",
          fn: function (req, res) {
            res.status(200).send("Success");
          },
        },
      ]);

      http.use(
        proxy("http://localhost:8080", {
          retry: true,
        }),
      );

      agent(http.callback()).get("/").expect(200).end(done);
    });
  });

  describe("when server responds with 5xx error", function () {
    it("should retry on 500 status code", function (done) {
      other = proxyTarget(8080, 100, [
        {
          method: "get",
          path: "/",
          fn: function (req, res) {
            res.status(500).send("Server error");
          },
        },
      ]);

      http.use(
        proxy("http://localhost:8080", {
          retry: {
            retries: 2,
            minTimeout: 50,
            maxTimeout: 100,
          },
        }),
      );

      agent(http.callback())
        .get("/")
        .expect(500)
        .end(function (err) {
          if (err) return done(err);
          done();
        });
    });
  });
});
