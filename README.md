# koa-http-proxy

A powerful Koa middleware for proxying HTTP requests to another host with advanced features like retry mechanisms, streaming support, and request/response transformation.

> This repository is forked from [koa-better-http-proxy](https://github.com/nsimmons/koa-better-http-proxy) with significant enhancements.

**🌍 Languages:** [English](README.md) | [中文](README_ZH.md)

## 📋 Table of Contents

- [✨ Features](#-features)
- [📦 Installation](#-installation)
- [🚀 Quick Start](#-quick-start)
- [📚 Usage Guide](#-usage-guide)
  - [Basic Proxy](#basic-proxy)
  - [Streaming Mode](#streaming-mode)
  - [Retry Configuration](#retry-configuration)
  - [Request/Response Transformation](#requestresponse-transformation)
- [⚙️ Configuration Reference](#️-configuration-reference)
- [🔗 Related Resources](#-related-resources)

## ✨ Features

| Feature | Description | Status |
|---------|-------------|---------|
| **🔄 Smart Retry** | Automatic retry with exponential backoff and custom logic | ✅ |
| **🌊 Streaming Support** | True streaming for large files and real-time data | ✅ |
| **🔧 Request/Response Transformation** | Modify headers, body, and paths with full async support | ✅ |
| **📊 Memory Management** | Automatic protection against OOM with large files | ✅ |
| **⏱️ Timeout Control** | Configurable connection and request timeouts | ✅ |
| **🛡️ Circuit Breaker** | Built-in patterns for fault tolerance | ✅ |
| **📝 TypeScript Support** | Full type definitions included | ✅ |
| **🔍 Conditional Proxy** | Filter requests with custom logic | ✅ |
| **🗜️ Compression** | Automatic gzip/deflate handling | ✅ |
| **🔐 Session Preservation** | Maintain user sessions across proxies | ✅ |

## 📦 Installation

```bash
npm install @reedchan/koa-http-proxy --save
```

## 🚀 Quick Start

### Basic Proxy

```js
const Koa = require('koa');
const proxy = require('@reedchan/koa-http-proxy');

const app = new Koa();

// Simple proxy to another host
app.use(proxy('api.example.com'));

app.listen(3000);
```

### API Gateway Pattern

```js
const app = new Koa();

// Route different paths to different services
app.use('/api/users', proxy('user-service.internal'));
app.use('/api/orders', proxy('order-service.internal'));
app.use('/api/auth', proxy('auth-service.internal'));

app.listen(3000);
```

### Load Balancer Pattern

```js
const servers = ['server1.com', 'server2.com', 'server3.com'];
let currentServer = 0;

app.use(proxy(() => {
  const server = servers[currentServer];
  currentServer = (currentServer + 1) % servers.length;
  return server;
}));
```

## 📚 Usage Guide

### Basic Proxy

The simplest use case - proxy all requests to another host:

```js
app.use(async (ctx) => {
  // Stop after proxy (don't continue to next middleware)
  await proxy('api.backend.com', {
    port: 443,
    https: true
  })(ctx);
});
```

### Koa Native Middleware Pattern ⭐

Following Koa's native design philosophy, you have complete control over middleware execution:

```js
// ✅ Stop after proxy - don't pass next
app.use(async (ctx) => {
  await proxy('api.backend.com')(ctx);
  // No next() called, execution stops here
});

// ✅ Continue after proxy - pass next
app.use(async (ctx, next) => {
  await proxy('api.backend.com')(ctx, next);
  // next() will be called, continues to next middleware
});

// ✅ Dynamic control based on conditions
app.use(async (ctx, next) => {
  const shouldContinue = ctx.path.startsWith('/api/');
  
  if (shouldContinue) {
    await proxy('api.backend.com')(ctx, next); // Continue
  } else {
    await proxy('api.backend.com')(ctx);       // Stop
  }
});
```

### Solving Route Duplication Issues

**The Problem:**
```js
// ❌ Both routes execute for the same request
router.post('/upload/:version/files', proxy('api.com')); // Executes
router.all('/(.*)', proxy('api.com'));                   // Also executes!
```

**The Solution (Koa Native Way):**
```js
// ✅ Clean, explicit control
router.post('/upload/:version/files', async (ctx) => {
  await proxy('api.com')(ctx); // Don't pass next - stops here
});

router.all('/(.*)', async (ctx, next) => {
  await proxy('api.com')(ctx, next); // Continue if needed
});
```

### Streaming Mode

Perfect for file uploads, downloads, and real-time data:

```js
// Enable streaming for file uploads
app.use('/upload', async (ctx) => {
  await proxy('fileserver.com', {
    parseReqBody: false,  // Enable streaming
    limit: '500mb',       // Support large files
    timeout: 300000       // 5 minute timeout
  })(ctx); // Stop after upload
});

// Smart conditional streaming
app.use(async (ctx, next) => {
  const proxy_fn = proxy('backend.com', {
    parseReqBody: (ctx) => {
      const size = parseInt(ctx.headers['content-length'] || '0');
      return size < 20 * 1024 * 1024; // Stream files >20MB
    }
  });
  
  if (ctx.path.includes('/upload')) {
    await proxy_fn(ctx); // Stop after upload
  } else {
    await proxy_fn(ctx, next); // Continue for other requests
  }
});
```

### Retry Configuration

Robust retry mechanisms for unreliable networks:

```js
// Simple retry with defaults
app.use(proxy('api.backend.com', {
  retry: true  // 3 retries with exponential backoff
}));

// Custom retry configuration
app.use(proxy('api.backend.com', {
  retry: {
    retries: 5,
    maxRetryTime: 30000,
    minTimeout: 500,
    maxTimeout: 5000
  }
}));

// Advanced custom retry logic
app.use(proxy('api.backend.com', {
  retry: async (handle, ctx) => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await handle();
        if (result.proxy.res.statusCode < 500) return result;
        
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      } catch (error) {
        if (attempt === 3) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
}));
```

### Request/Response Transformation

Modify requests and responses on the fly:

```js
app.use(proxy('api.backend.com', {
  // Transform request path
  proxyReqPathResolver: (ctx) => {
    return ctx.path.replace('/api/v1', '/api/v2');
  },
  
  // Add authentication headers
  proxyReqOptDecorator: (proxyReqOpts, ctx) => {
    proxyReqOpts.headers['Authorization'] = ctx.headers['authorization'];
    return proxyReqOpts;
  },
  
  // Transform response
  userResDecorator: (proxyRes, proxyResData, ctx) => {
    const data = JSON.parse(proxyResData.toString());
    data.timestamp = new Date().toISOString();
    return JSON.stringify(data);
  }
}));
```

## ⚙️ Configuration Reference

<details>
<summary><strong>Click to expand detailed configuration options</strong></summary>

### Core Options

#### `agent`
Use a custom `http.Agent` for proxy requests.

```js
const agent = new http.Agent({ keepAlive: true });
app.use(proxy('api.backend.com', { agent }));
```

#### `port`
The port to use for the proxied host.

```js
app.use(proxy('api.backend.com', { port: 8080 }));
```

#### `https`
Force HTTPS for the proxy request.

```js
app.use(proxy('api.backend.com', { https: true }));
```

#### `headers`
Additional headers to send to the proxied host.

```js
app.use(proxy('api.backend.com', {
  headers: {
    'X-API-Key': 'your-api-key',
    'User-Agent': 'MyApp/1.0'
  }
}));
```

#### `strippedHeaders`
Headers to remove from proxy response.

```js
app.use(proxy('api.backend.com', {
  strippedHeaders: ['set-cookie', 'x-internal-header']
}));
```

### Request Processing

#### `filter`
Filter which requests should be proxied.

```js
app.use(proxy('api.backend.com', {
  filter: (ctx) => {
    return ctx.method === 'GET' && ctx.path.startsWith('/api');
  }
}));
```

#### `proxyReqPathResolver`
Transform the request path before proxying.

```js
app.use(proxy('api.backend.com', {
  proxyReqPathResolver: (ctx) => {
    return ctx.path.replace(/^\/api/, '');
  }
}));
```

#### `proxyReqOptDecorator`
Modify request options before sending.

```js
app.use(proxy('api.backend.com', {
  proxyReqOptDecorator: (proxyReqOpts, ctx) => {
    proxyReqOpts.headers['X-Forwarded-For'] = ctx.ip;
    return proxyReqOpts;
  }
}));
```

#### `proxyReqBodyDecorator`
Transform request body before sending.

```js
app.use(proxy('api.backend.com', {
  proxyReqBodyDecorator: (bodyContent, ctx) => {
    const data = JSON.parse(bodyContent);
    data.clientInfo = { ip: ctx.ip, userAgent: ctx.get('User-Agent') };
    return JSON.stringify(data);
  }
}));
```

### Response Processing

#### `userResDecorator`
Transform response data before sending to client.

```js
app.use(proxy('api.backend.com', {
  userResDecorator: (proxyRes, proxyResData, ctx) => {
    const data = JSON.parse(proxyResData.toString());
    data.processedAt = new Date().toISOString();
    return JSON.stringify(data);
  }
}));
```

#### `userResHeadersDecorator`
Transform response headers.

```js
app.use(proxy('api.backend.com', {
  userResHeadersDecorator: (headers) => {
    headers['X-Proxy-By'] = 'koa-http-proxy';
    delete headers['x-internal-header'];
    return headers;
  }
}));
```

### Body Processing

#### `parseReqBody`
Control request body parsing (boolean or function).

```js
// Disable for streaming
app.use(proxy('api.backend.com', { parseReqBody: false }));

// Conditional parsing
app.use(proxy('api.backend.com', {
  parseReqBody: (ctx) => {
    return !ctx.path.includes('/upload');
  }
}));
```

#### `reqAsBuffer`
Ensure request body is encoded as Buffer.

```js
app.use(proxy('api.backend.com', { reqAsBuffer: true }));
```

#### `reqBodyEncoding`
Encoding for request body (default: 'utf-8').

```js
app.use(proxy('api.backend.com', { reqBodyEncoding: 'binary' }));
```

#### `limit`
Body size limit (default: '1mb').

```js
app.use(proxy('api.backend.com', { limit: '50mb' }));
```

### Session & Security

#### `preserveReqSession`
Pass session along to proxied request.

```js
app.use(proxy('api.backend.com', { preserveReqSession: true }));
```

#### `preserveHostHdr`
Copy the host HTTP header to proxied request.

```js
app.use(proxy('api.backend.com', { preserveHostHdr: true }));
```

### Timeout Configuration

#### `connectTimeout`
Timeout for initial connection.

```js
app.use(proxy('api.backend.com', { connectTimeout: 5000 }));
```

#### `timeout`
Overall request timeout.

```js
app.use(proxy('api.backend.com', { timeout: 30000 }));
```

### Debug Options

#### `debug`
Enable detailed request logging for debugging and monitoring.

```js
// Enable basic debug logging
app.use(proxy('api.backend.com', { debug: true }));

// Use object configuration for debug options
app.use(proxy('api.backend.com', { 
  debug: { 
    enabled: true, 
    includeBody: true  // Include request body content
  } 
}));
```

**Example Output:**
```
======================================= KOA-HTTP-PROXY DEBUG =======================================
POST https://api.backend.com/users
Payload Size: 256 B
Headers:
{
  "content-type": "application/json",
  "authorization": "Bearer token123",
  "user-agent": "MyApp/1.0",
  "content-length": 256
}
Request Body:
{
  "name": "John Doe",
  "email": "john@example.com"
}
====================================================================================================
```

**Configuration Options:**
- `enabled`: Whether to enable debug logging (default: false)
- `includeBody`: Whether to include request body content in logs (default: false)

**Features:**
- Automatically hide standard ports (HTTP 80, HTTPS 443)
- Smart JSON formatting
- No body parsing for GET/HEAD/DELETE/OPTIONS requests
- Precise file size display

**Use Cases:**
- Development debugging
- API monitoring
- Performance analysis
- Request troubleshooting

### Retry Configuration

#### Simple Retry
```js
app.use(proxy('api.backend.com', { retry: true }));
```

#### Advanced Retry
```js
app.use(proxy('api.backend.com', {
  retry: {
    retries: 5,           // Max retry attempts
    maxRetryTime: 30000,  // Total retry time limit
    minTimeout: 1000,     // Initial delay
    maxTimeout: 10000     // Maximum delay
  }
}));
```

#### Custom Retry Function
```js
app.use(proxy('api.backend.com', {
  retry: async (handle, ctx) => {
    // Custom retry logic
    let result;
    for (let i = 0; i < 3; i++) {
      result = await handle();
      if (result.proxy.res.statusCode < 500) break;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
    return result;
  }
}));
```

> ⚠️ **Memory Warning**: Retry caches request body in memory. For large files (>20MB), retry is automatically disabled. Use `parseReqBody: false` for streaming mode.

</details>

## 🔗 Related Resources

- **[Streaming Guide](STREAMING.md)** - Comprehensive guide for handling large files and real-time streams
- **[Examples](examples/)** - Working examples for different use cases
- **[TypeScript Definitions](types.d.ts)** - Full type definitions for TypeScript users

---

**Made with ❤️ by the community** | [Report Issues](https://github.com/reedchan7/koa-http-proxy/issues) | [Contribute](https://github.com/reedchan7/koa-http-proxy/pulls)
