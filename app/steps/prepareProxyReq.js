"use strict";

var as = require("../../lib/as");

function getContentLength(body) {
  var result;
  if (Buffer.isBuffer(body)) {
    // Buffer
    result = body.length;
  } else if (typeof body === "string") {
    result = Buffer.byteLength(body);
  }
  return result;
}

function hasActualContent(body) {
  if (!body) return false;
  if (Buffer.isBuffer(body) && body.length === 0) return false;
  if (typeof body === "string" && body.length === 0) return false;
  if (typeof body === "object" && Object.keys(body).length === 0) return false;
  return true;
}

function prepareProxyReq(container) {
  return new Promise(function (resolve) {
    var bodyContent = container.proxy.bodyContent;
    var reqOpt = container.proxy.reqBuilder;

    if (bodyContent && hasActualContent(bodyContent)) {
      bodyContent = container.options.reqAsBuffer
        ? as.buffer(bodyContent, container.options)
        : as.bufferOrString(bodyContent);

      reqOpt.headers["content-length"] = getContentLength(bodyContent);

      if (container.options.reqBodyEncoding) {
        reqOpt.headers["accept-charset"] = container.options.reqBodyEncoding;
      }
    } else {
      // Ensure no content-length is set for requests without body
      delete reqOpt.headers["content-length"];
      bodyContent = null;
    }

    container.proxy.bodyContent = bodyContent;
    resolve(container);
  });
}

module.exports = prepareProxyReq;
