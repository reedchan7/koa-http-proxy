"use strict";

var ScopeContainer = require("./lib/scopeContainer");
var assert = require("assert");
var executeWithRetry = require("./app/steps/executeWithRetry");

module.exports = function proxy(host, userOptions) {
  assert(host, "Host should not be empty");
  return function (ctx, next) {
    var container = new ScopeContainer(ctx, host, userOptions);

    // Skip proxy if filter is falsey.  Loose equality so filters can return
    // false, null, undefined, etc.
    if (!container.options.filter(ctx)) {
      return Promise.resolve(null).then(next);
    }

    return executeWithRetry(container).then(next);
  };
};
