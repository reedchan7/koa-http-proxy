"use strict";

var requestOptions = require("../../lib/requestOptions");

function buildProxyReq(Container) {
  var ctx = Container.user.ctx;
  var options = Container.options;
  var host = Container.proxy.host;

  // Evaluate parseReqBody - can be boolean or function
  var shouldParseBody;
  if (typeof options.parseReqBody === 'function') {
    shouldParseBody = options.parseReqBody(ctx);
  } else {
    shouldParseBody = options.parseReqBody;
  }

  var parseBody = !shouldParseBody
    ? Promise.resolve(null)
    : requestOptions.bodyContent(ctx, options);
  var createReqOptions = requestOptions.create(ctx, options, host);

  return Promise.all([parseBody, createReqOptions]).then(
    function (responseArray) {
      Container.proxy.bodyContent = responseArray[0];
      Container.proxy.reqBuilder = responseArray[1];
      // Store the resolved parseReqBody value for later use
      Container.options.parseReqBody = shouldParseBody;
      return Container;
    },
  );
}

module.exports = buildProxyReq;
