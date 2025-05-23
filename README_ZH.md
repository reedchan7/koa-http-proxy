# koa-http-proxy

一个强大的 Koa 中间件，用于将 HTTP 请求代理到另一个主机，具有重试机制、流式传输支持和请求/响应转换等高级功能。

> 本仓库从 [koa-better-http-proxy](https://github.com/nsimmons/koa-better-http-proxy) fork 而来，并进行了重大改进。

**🌍 Languages:** [English](README.md) | [中文](README_ZH.md)

## 📋 目录

- [✨ 功能特性](#-功能特性)
- [📦 安装](#-安装)
- [🚀 快速开始](#-快速开始)
- [📚 使用指南](#-使用指南)
  - [基础代理](#基础代理)
  - [流式传输模式](#流式传输模式)
  - [重试配置](#重试配置)
  - [请求/响应转换](#请求响应转换)
- [⚙️ 配置参考](#️-配置参考)
- [🔗 相关资源](#-相关资源)

## ✨ 功能特性

| 功能 | 描述 | 状态 |
|------|------|------|
| **🔄 智能重试** | 指数退避和自定义逻辑的自动重试 | ✅ |
| **🌊 流式传输支持** | 大文件和实时数据的真正流式传输 | ✅ |
| **🔧 请求/响应转换** | 修改请求头、正文和路径，完全支持异步 | ✅ |
| **📊 内存管理** | 自动防止大文件导致的内存溢出 | ✅ |
| **⏱️ 超时控制** | 可配置的连接和请求超时 | ✅ |
| **🛡️ 熔断器** | 内置容错模式 | ✅ |
| **📝 TypeScript 支持** | 包含完整的类型定义 | ✅ |
| **🔍 条件代理** | 使用自定义逻辑过滤请求 | ✅ |
| **🗜️ 压缩** | 自动 gzip/deflate 处理 | ✅ |
| **🔐 会话保持** | 跨代理维护用户会话 | ✅ |

## 📦 安装

```bash
npm install @reedchan/koa-http-proxy --save
```

## 🚀 快速开始

### 基础代理

```js
const Koa = require('koa');
const proxy = require('@reedchan/koa-http-proxy');

const app = new Koa();

// 简单代理到另一个主机
app.use(proxy('api.example.com'));

app.listen(3000);
```

### API 网关模式

```js
const app = new Koa();

// 将不同路径路由到不同服务
app.use('/api/users', proxy('user-service.internal'));
app.use('/api/orders', proxy('order-service.internal'));
app.use('/api/auth', proxy('auth-service.internal'));

app.listen(3000);
```

### 负载均衡模式

```js
const servers = ['server1.com', 'server2.com', 'server3.com'];
let currentServer = 0;

app.use(proxy(() => {
  const server = servers[currentServer];
  currentServer = (currentServer + 1) % servers.length;
  return server;
}));
```

## 📚 使用指南

### 基础代理

最简单的用例 - 将所有请求代理到另一个主机：

```js
app.use(proxy('api.backend.com', {
  port: 443,
  https: true
}));
```

### 流式传输模式

适用于文件上传、下载和实时数据：

```js
// 为文件上传启用流式传输
app.use('/upload', proxy('fileserver.com', {
  parseReqBody: false,  // 启用流式传输
  limit: '500mb',       // 支持大文件
  timeout: 300000       // 5分钟超时
}));

// 智能条件流式传输
app.use(proxy('backend.com', {
  parseReqBody: (ctx) => {
    const size = parseInt(ctx.headers['content-length'] || '0');
    return size < 20 * 1024 * 1024; // 大于20MB的文件使用流式传输
  }
}));
```

### 重试配置

针对不稳定网络的强大重试机制：

```js
// 使用默认设置的简单重试
app.use(proxy('api.backend.com', {
  retry: true  // 3次重试，指数退避
}));

// 自定义重试配置
app.use(proxy('api.backend.com', {
  retry: {
    retries: 5,
    maxRetryTime: 30000,
    minTimeout: 500,
    maxTimeout: 5000
  }
}));

// 高级自定义重试逻辑
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

### 请求/响应转换

动态修改请求和响应：

```js
app.use(proxy('api.backend.com', {
  // 转换请求路径
  proxyReqPathResolver: (ctx) => {
    return ctx.path.replace('/api/v1', '/api/v2');
  },
  
  // 添加认证头
  proxyReqOptDecorator: (proxyReqOpts, ctx) => {
    proxyReqOpts.headers['Authorization'] = ctx.headers['authorization'];
    return proxyReqOpts;
  },
  
  // 转换响应
  userResDecorator: (proxyRes, proxyResData, ctx) => {
    const data = JSON.parse(proxyResData.toString());
    data.timestamp = new Date().toISOString();
    return JSON.stringify(data);
  }
}));
```

## ⚙️ 配置参考

<details>
<summary><strong>点击展开详细配置选项</strong></summary>

### 核心选项

#### `agent`
使用自定义的 `http.Agent` 进行代理请求。

```js
const agent = new http.Agent({ keepAlive: true });
app.use(proxy('api.backend.com', { agent }));
```

#### `port`
代理主机使用的端口。

```js
app.use(proxy('api.backend.com', { port: 8080 }));
```

#### `https`
强制代理请求使用 HTTPS。

```js
app.use(proxy('api.backend.com', { https: true }));
```

#### `headers`
发送到代理主机的额外请求头。

```js
app.use(proxy('api.backend.com', {
  headers: {
    'X-API-Key': 'your-api-key',
    'User-Agent': 'MyApp/1.0'
  }
}));
```

#### `strippedHeaders`
从代理响应中移除的请求头。

```js
app.use(proxy('api.backend.com', {
  strippedHeaders: ['set-cookie', 'x-internal-header']
}));
```

### 请求处理

#### `filter`
过滤需要代理的请求。

```js
app.use(proxy('api.backend.com', {
  filter: (ctx) => {
    return ctx.method === 'GET' && ctx.path.startsWith('/api');
  }
}));
```

#### `proxyReqPathResolver`
在代理前转换请求路径。

```js
app.use(proxy('api.backend.com', {
  proxyReqPathResolver: (ctx) => {
    return ctx.path.replace(/^\/api/, '');
  }
}));
```

#### `proxyReqOptDecorator`
在发送前修改请求选项。

```js
app.use(proxy('api.backend.com', {
  proxyReqOptDecorator: (proxyReqOpts, ctx) => {
    proxyReqOpts.headers['X-Forwarded-For'] = ctx.ip;
    return proxyReqOpts;
  }
}));
```

#### `proxyReqBodyDecorator`
在发送前转换请求正文。

```js
app.use(proxy('api.backend.com', {
  proxyReqBodyDecorator: (bodyContent, ctx) => {
    const data = JSON.parse(bodyContent);
    data.clientInfo = { ip: ctx.ip, userAgent: ctx.get('User-Agent') };
    return JSON.stringify(data);
  }
}));
```

### 响应处理

#### `userResDecorator`
在发送给客户端前转换响应数据。

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
转换响应头。

```js
app.use(proxy('api.backend.com', {
  userResHeadersDecorator: (headers) => {
    headers['X-Proxy-By'] = 'koa-http-proxy';
    delete headers['x-internal-header'];
    return headers;
  }
}));
```

### 正文处理

#### `parseReqBody`
控制请求正文解析（布尔值或函数）。

```js
// 禁用以启用流式传输
app.use(proxy('api.backend.com', { parseReqBody: false }));

// 条件解析
app.use(proxy('api.backend.com', {
  parseReqBody: (ctx) => {
    return !ctx.path.includes('/upload');
  }
}));
```

#### `reqAsBuffer`
确保请求正文编码为 Buffer。

```js
app.use(proxy('api.backend.com', { reqAsBuffer: true }));
```

#### `reqBodyEncoding`
请求正文的编码（默认: 'utf-8'）。

```js
app.use(proxy('api.backend.com', { reqBodyEncoding: 'binary' }));
```

#### `limit`
正文大小限制（默认: '1mb'）。

```js
app.use(proxy('api.backend.com', { limit: '50mb' }));
```

### 会话与安全

#### `preserveReqSession`
将会话传递给代理请求。

```js
app.use(proxy('api.backend.com', { preserveReqSession: true }));
```

#### `preserveHostHdr`
将 host HTTP 头复制到代理请求。

```js
app.use(proxy('api.backend.com', { preserveHostHdr: true }));
```

### 超时配置

#### `connectTimeout`
初始连接的超时时间。

```js
app.use(proxy('api.backend.com', { connectTimeout: 5000 }));
```

#### `timeout`
整体请求超时时间。

```js
app.use(proxy('api.backend.com', { timeout: 30000 }));
```

### 调试选项

#### `debug`
启用详细的请求日志记录，用于调试和监控。

```js
// 启用基础调试日志
app.use(proxy('api.backend.com', { debug: true }));

// 使用对象配置调试选项
app.use(proxy('api.backend.com', { 
  debug: { 
    enabled: true, 
    includeBody: true  // 包含请求体内容
  } 
}));
```

**示例输出:**
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
  "name": "张三",
  "email": "zhangsan@example.com"
}
====================================================================================================
```

**配置选项:**
- `enabled`: 是否启用调试日志（默认: false）
- `includeBody`: 是否在日志中包含请求体内容（默认: false）

**功能特性:**
- 自动隐藏标准端口号（HTTP 80, HTTPS 443）
- 智能 JSON 格式化
- 对 GET/HEAD/DELETE/OPTIONS 请求不解析请求体
- 精确的文件大小显示

**使用场景:**
- 开发环境调试
- API 请求监控
- 性能分析
- 故障排查

### 重试配置

#### 简单重试
```js
app.use(proxy('api.backend.com', { retry: true }));
```

#### 高级重试
```js
app.use(proxy('api.backend.com', {
  retry: {
    retries: 5,           // 最大重试次数
    maxRetryTime: 30000,  // 总重试时间限制
    minTimeout: 1000,     // 初始延迟
    maxTimeout: 10000     // 最大延迟
  }
}));
```

#### 自定义重试函数
```js
app.use(proxy('api.backend.com', {
  retry: async (handle, ctx) => {
    // 自定义重试逻辑
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

> ⚠️ **内存警告**：重试功能会在内存中缓存请求正文。对于大文件（>20MB），重试会自动禁用。使用 `parseReqBody: false` 启用流式传输模式。

</details>

## 🔗 相关资源

- **[流式传输指南](STREAMING.md)** - 处理大文件和实时流的综合指南
- **[示例](examples/)** - 不同用例的工作示例
- **[TypeScript 定义](types.d.ts)** - TypeScript 用户的完整类型定义

---

**由社区用心制作 ❤️** | [报告问题](https://github.com/reedchan7/koa-http-proxy/issues) | [贡献代码](https://github.com/reedchan7/koa-http-proxy/pulls) 