# koa-http-proxy
Koa middleware to proxy request to another host and pass response back.

| This repository is forked from [koa-better-http-proxy](https://github.com/nsimmons/koa-better-http-proxy).

## Install

```bash
$ npm install @reedchan/koa-http-proxy --save
```

## Usage
```js
proxy(host, options);
```

To proxy URLS to the host 'www.google.com':

```js
var proxy = require('@reedchan/koa-http-proxy');
var Koa = require('koa');

var app = new Koa();
app.use(proxy('www.google.com'));
```

If you wish to proxy only specific paths, you can use a router middleware to accomplish this. See [Koa routing middlewares](https://github.com/koajs/koa/wiki#routing-and-mounting).

### Options

#### agent

Use a custom `http.Agent` for proxy requests.

```js
var agent = new http.Agent(options);
app.use(proxy('www.google.com', {
  agent: agent,
}));
```

#### port

The port to use for the proxied host.

```js
app.use(proxy('www.google.com', {
  port: 443
}));
```

#### headers

Additional headers to send to the proxied host.

```js
app.use(proxy('www.google.com', {
  headers: {
    'X-Special-Header': 'true'
  }
}));
```


#### strippedHeaders

Headers to remove from proxy response.

```js
app.use(proxy('www.google.com', {
  strippedHeaders: [
    'set-cookie'
  ]
}));
```

#### preserveReqSession

Pass the session along to the proxied request

```js
app.use(proxy('www.google.com', {
  preserveReqSession: true
}));
```

#### proxyReqPathResolver (supports Promises)

Provide a proxyReqPathResolver function if you'd like to
operate on the path before issuing the proxy request.  Use a Promise for async
operations.

```js
app.use(proxy('localhost:12345', {
  proxyReqPathResolver: function(ctx) {
    return require('url').parse(ctx.url).path;
  }
}));
```

Promise form

```js
app.use(proxy('localhost:12345', {
  proxyReqPathResolver: function(ctx) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {   // do asyncness
        resolve(fancyResults);
      }, 200);
    });
  }
}));
```

#### filter

The ```filter``` option can be used to limit what requests are proxied.  Return ```true``` to execute proxy.

For example, if you only want to proxy get request:

```js
app.use(proxy('www.google.com', {
  filter: function(ctx) {
     return ctx.method === 'GET';
  }
}));
```

#### userResDecorator (supports Promise)

You can modify the proxy's response before sending it to the client.

##### exploiting references
The intent is that this be used to modify the proxy response data only.

Note:
The other arguments (proxyRes, ctx) are passed by reference, so
you *can* currently exploit this to modify either response's headers, for
instance, but this is not a reliable interface. I expect to close this
exploit in a future release, while providing an additional hook for mutating
the userRes before sending.

#### userResHeadersDecorator (supports Promise)

You can modify the proxy's headers before sending it to the client.

##### gzip responses

If your proxy response is gzipped, this program will automatically unzip
it before passing to your function, then zip it back up before piping it to the
user response.  There is currently no way to short-circuit this behavior.

```js
app.use(proxy('www.google.com', {
  userResDecorator: function(proxyRes, proxyResData, ctx) {
    data = JSON.parse(proxyResData.toString('utf8'));
    data.newProperty = 'exciting data';
    return JSON.stringify(data);
  }
}));
```

```js
app.use(proxy('httpbin.org', {
  userResDecorator: function(proxyRes, proxyResData) {
    return new Promise(function(resolve) {
      proxyResData.funkyMessage = 'oi io oo ii';
      setTimeout(function() {
        resolve(proxyResData);
      }, 200);
    });
  }
}));
```

#### limit

This sets the body size limit (default: `1mb`). If the body size is larger than the specified (or default) limit,
a `413 Request Entity Too Large`  error will be returned. See [bytes.js](https://www.npmjs.com/package/bytes) for
a list of supported formats.

```js
app.use(proxy('www.google.com', {
  limit: '5mb'
}));
```

#### proxyReqOptDecorator  (supports Promise form)

You can mutate the request options before sending the proxyRequest.
proxyReqOpt represents the options argument passed to the (http|https).request
module.

NOTE:  req.path cannot be changed via this method;  use ```proxyReqPathResolver``` instead.

```js
app.use(proxy('www.google.com', {
  proxyReqOptDecorator: function(proxyReqOpts, ctx) {
    // you can update headers
    proxyReqOpts.headers['content-type'] = 'text/html';
    // you can change the method
    proxyReqOpts.method = 'GET';
    return proxyReqOpts;
  }
}));
```

You can use a Promise for async style.

```js
app.use(proxy('www.google.com', {
  proxyReqOptDecorator: function(proxyReqOpts, ctx) {
    return new Promise(function(resolve, reject) {
      proxyReqOpts.headers['content-type'] = 'text/html';
      resolve(proxyReqOpts);
    })
  }
}));
```

#### proxyReqBodyDecorator  (supports Promise form)

You can mutate the body content before sending the proxyRequest.

```js
app.use(proxy('www.google.com', {
  proxyReqBodyDecorator: function(bodyContent, ctx) {
    return bodyContent.split('').reverse().join('');
  }
}));
```

You can use a Promise for async style.

```js
app.use(proxy('www.google.com', {
  proxyReqBodyDecorator: function(proxyReq, ctx) {
    return new Promise(function(resolve, reject) {
      http.get('http://dev/null', function (err, res) {
        if (err) { reject(err); }
        resolve(res);
      });
    })
  }
}));
```

#### https

Normally, your proxy request will be made on the same protocol as the original
request.  If you'd like to force the proxy request to be https, use this
option.

```js
app.use(proxy('www.google.com', {
  https: true
}));
```

#### preserveHostHdr

You can copy the host HTTP header to the proxied express server using the `preserveHostHdr` option.

```js
app.use(proxy('www.google.com', {
  preserveHostHdr: true
}));
```

#### parseReqBody

The ```parseReqBody``` option allows you to control parsing the request body.
For example, disabling body parsing is useful for large uploads where it would be inefficient
to hold the data in memory.

This defaults to true in order to preserve legacy behavior.

When false, no action will be taken on the body and accordingly ```req.body``` will no longer be set.

Note that setting this to false overrides ```reqAsBuffer``` and ```reqBodyEncoding``` below.

```js
app.use(proxy('www.google.com', {
  parseReqBody: false
}));
```

#### reqAsBuffer

Note: this is an experimental feature.  ymmv

The ```reqAsBuffer``` option allows you to ensure the req body is encoded as a Node
```Buffer``` when sending a proxied request.   Any value for this is truthy.

This defaults to to false in order to preserve legacy behavior. Note that
the value of ```reqBodyEnconding``` is used as the encoding when coercing strings
(and stringified JSON) to Buffer.

Ignored if ```parseReqBody``` is set to false.

```js
app.use(proxy('www.google.com', {
  reqAsBuffer: true
}));
```

#### reqBodyEncoding

Encoding used to decode request body. Defaults to ```utf-8```.

Use ```null``` to preserve as Buffer when proxied request body is a Buffer. (e.g image upload)
Accept any values supported by [raw-body](https://www.npmjs.com/package/raw-body#readme).

The same encoding is used in the userResDecorator method.

Ignored if ```parseReqBody``` is set to false.

```js
app.use(proxy('httpbin.org', {
  reqBodyEncoding: null
}));
```

#### connectTimeout

By default, node does not express a timeout on connections.
Use connectTimeout option to impose a specific timeout on the inital connection. (`connect` for http requests and `secureConnect` for https)
This is useful if there are dns, network issues, or if you are uncertain if the destination is reachable.
Timed-out requests will respond with 504 status code and a X-Timeout-Reason header.

```js
app.use(proxy('httpbin.org', {
  connectTimeout: 2000  // in milliseconds, two seconds
}));
```


#### timeout

By default, node does not express a timeout on connections.
Use timeout option to impose a specific timeout. This includes the time taken to make the connection and can be used with or without `connectTimeout`.
Timed-out requests will respond with 504 status code and a X-Timeout-Reason header.

```js
app.use(proxy('httpbin.org', {
  timeout: 2000  // in milliseconds, two seconds
}));
```

#### retry

Configure automatic retry behavior for failed proxy requests. Supports three forms:

##### Simple retry (boolean)

Enable retry with default settings:

```js
app.use(proxy('httpbin.org', {
  retry: true  // Uses default: 3 retries, 1s min timeout, exponential backoff
}));
```

##### Custom retry configuration (object)

Configure retry behavior with custom parameters:

```js
app.use(proxy('httpbin.org', {
  retry: {
    retries: 5,           // Maximum number of retry attempts (default: 3)
    maxRetryTime: 30000,  // Maximum total time for all retries in ms (default: Infinity)
    minTimeout: 500,      // Initial retry delay in ms (default: 1000)
    maxTimeout: 10000     // Maximum retry delay in ms (default: Infinity)
  }
}));
```

**Parameters:**
- `retries` - Maximum number of retry attempts (default: 3)
- `maxRetryTime` - Maximum total time allowed for all retries in milliseconds (default: Infinity)
- `minTimeout` - Initial retry delay in milliseconds (default: 1000)
- `maxTimeout` - Maximum retry delay in milliseconds (default: Infinity)

The built-in retry logic uses exponential backoff with jitter and automatically retries on:
- Network errors (ECONNRESET, ECONNREFUSED, ETIMEDOUT, ENOTFOUND)
- Server errors (5xx status codes)

##### Custom retry function

Implement your own retry logic with full control:

```js
app.use(proxy('httpbin.org', {
  retry: function(executeHandler, ctx) {
    // executeHandler is a function that performs the proxy request
    // ctx is the Koa context object
    
    // Example: Custom retry with different logic for different methods
    if (ctx.method === 'POST') {
      // Don't retry POST requests to avoid duplicates
      return executeHandler();
    }
    
    // Custom retry logic for GET requests
    var maxAttempts = 3;
    var attempt = 0;
    
    function tryRequest() {
      return executeHandler()
        .catch(function(error) {
          attempt++;
          
          // Don't retry client errors (4xx)
          if (error.status >= 400 && error.status < 500) {
            throw error;
          }
          
          // Retry on network errors and server errors
          if (attempt < maxAttempts && 
              (error.code === 'ECONNRESET' || error.status >= 500)) {
            var delay = 1000 * Math.pow(2, attempt - 1); // Exponential backoff
            return new Promise(function(resolve, reject) {
              setTimeout(function() {
                tryRequest().then(resolve).catch(reject);
              }, delay);
            });
          }
          
          throw error;
        });
    }
    
    return tryRequest();
  }
}));
```

##### Advanced Examples

**Circuit breaker pattern:**
```js
app.use(proxy('api.example.com', {
  retry: function(executeHandler, ctx) {
    var failures = global.circuitBreakerFailures || 0;
    
    if (failures >= 5) {
      return Promise.reject(new Error('Circuit breaker open'));
    }
    
    return executeHandler()
      .then(function(result) {
        global.circuitBreakerFailures = 0; // Reset on success
        return result;
      })
      .catch(function(error) {
        global.circuitBreakerFailures = failures + 1;
        
        if (failures < 3) {
          // Retry with delay
          return new Promise(function(resolve, reject) {
            setTimeout(function() {
              executeHandler().then(resolve).catch(reject);
            }, 1000);
          });
        }
        
        throw error;
      });
  }
}));
```

**Retry with monitoring:**
```js
app.use(proxy('api.example.com', {
  retry: function(executeHandler, ctx) {
    var attempt = 0;
    
    function tryWithLogging() {
      attempt++;
      return executeHandler()
        .then(function(result) {
          console.log(`Success on attempt ${attempt} for ${ctx.url}`);
          return result;
        })
        .catch(function(error) {
          console.log(`Attempt ${attempt} failed for ${ctx.url}: ${error.message}`);
          
          if (attempt < 3) {
            var delay = 1000 * attempt;
            return new Promise(function(resolve, reject) {
              setTimeout(function() {
                tryWithLogging().then(resolve).catch(reject);
              }, delay);
            });
          }
          
          throw error;
        });
    }
    
    return tryWithLogging();
  }
}));
```
