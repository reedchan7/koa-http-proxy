"use strict";

var chunkLength = require("../../lib/chunkLength");

function getPayloadSize(bodyContent) {
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

function formatSize(bytes) {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024.0).toFixed(2) + " KB";
  return (bytes / (1024.0 * 1024.0)).toFixed(2) + " MB";
}

function debugLogRequest(reqOpt, bodyContent, options) {
  if (!options.debug) return;

  var protocol = reqOpt.port === 443 || options.https ? "https" : "http";
  var url = protocol + "://" + reqOpt.host + ":" + reqOpt.port + reqOpt.path;
  var payloadSize = getPayloadSize(bodyContent);

  console.log("");
  console.log("========================== KOA-HTTP-PROXY DEBUG ==========================");
  console.log(reqOpt.method + " " + url);
  
  if (payloadSize > 0) {
    console.log("Payload Size: " + formatSize(payloadSize));
  }
  
  console.log("Headers:");
  console.log(JSON.stringify(reqOpt.headers, null, 2));
  console.log("==========================================================================");
  console.log("");
}

function sendProxyRequest(Container) {
  var ctx = Container.user.ctx;
  var bodyContent = Container.proxy.bodyContent;
  var reqOpt = Container.proxy.reqBuilder;
  var options = Container.options;

  return new Promise(function (resolve, reject) {
    var protocol = Container.proxy.requestModule;
    
    // Debug logging
    debugLogRequest(reqOpt, bodyContent, options);
    
    var proxyReq = protocol.request(reqOpt, function (rsp) {
      var chunks = [];
      rsp.on("data", function (chunk) {
        chunks.push(chunk);
      });
      rsp.on("end", function () {
        Container.proxy.res = rsp;
        Container.proxy.resData = Buffer.concat(chunks, chunkLength(chunks));
        resolve(Container);
      });
      rsp.on("error", reject);
    });
    var abortRequest = function () {
      proxyReq.abort();
    };
    var timeoutDuration = null;

    proxyReq.on("socket", function (socket) {
      var isSecure = Container.proxy.isSecure;
      var timeout = options.timeout;
      var connectTimeout = options.connectTimeout;
      // "secureConnect" includes time taken for "lookup" (dns), "connect" and "ready" events, as well as tls handshake.
      var eventListener = isSecure ? "secureConnect" : "connect";

      if (connectTimeout) {
        timeoutDuration = connectTimeout;
        socket.setTimeout(connectTimeout, abortRequest);

        socket.on(eventListener, function () {
          if (timeout) {
            timeoutDuration = timeout;
            socket.setTimeout(timeout, abortRequest);
          } else {
            // 0 to reset to the default of no timeout for the rest of the request
            socket.setTimeout(0);
          }
        });
      } else if (timeout) {
        timeoutDuration = timeout;
        socket.setTimeout(timeout, abortRequest);
      }
    });

    // TODO: do reject here and handle this later on
    proxyReq.on("error", function (err) {
      // reject(error);
      if (err.code === "ECONNRESET") {
        ctx.set(
          "X-Timout-Reason",
          "koa-http-proxy timed out your request after " +
            timeoutDuration +
            "ms.",
        );
        ctx.set("Content-Type", "text/plain");
        ctx.status = 504;
        resolve(Container);
      } else {
        reject(err);
      }
    });

    // this guy should go elsewhere, down the chain
    if (options.parseReqBody) {
      // We are parsing the body ourselves so we need to write the body content
      // and then manually end the request.

      //if (bodyContent instanceof Object) {
      //throw new Error
      //debugger;
      //bodyContent = JSON.stringify(bodyContent);
      //}

      if (bodyContent.length) {
        proxyReq.write(bodyContent);
      }
      proxyReq.end();
    } else {
      // Pipe will call end when it has completely read from the request.
      ctx.req.pipe(proxyReq);
    }

    ctx.req.on("aborted", function () {
      // reject?
      proxyReq.abort();
    });
  });
}

module.exports = sendProxyRequest;
