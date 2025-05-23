# Streaming Support Guide

## ✅ Important Clarification: Full Streaming Support

**koa-http-proxy fully supports streaming**! Just configure it properly.

## 🔧 Configuration Methods

### Method 1: Streaming Mode (Recommended for large files/real-time streams)

```js
app.use('/upload', proxy('fileserver.com', {
  parseReqBody: false,  // Enable streaming mode
  retry: false,         // Optional: explicitly disable retry
  limit: '500mb'        // Support large files
}));
```

### Method 2: Buffer Mode (Recommended for APIs/small data)

```js
app.use('/api', proxy('api.server.com', {
  parseReqBody: true,   // Default: buffer mode
  retry: true          // Support retry
}));
```

### Method 3: Smart Conditional Mode (Auto-selection)

```js
app.use(proxy('backend.com', {
  parseReqBody: function(ctx) {
    const size = parseInt(ctx.headers['content-length'] || '0');
    const isUpload = ctx.path.includes('/upload');
    
    // Use streaming for large files or uploads
    if (size > 10 * 1024 * 1024 || isUpload) {
      return false; // streaming mode
    }
    
    return true; // buffer mode (supports retry)
  },
  
  retry: async (handle, ctx) => {
    // Only executes in buffer mode
    return await smartRetryLogic(handle, ctx);
  }
}));
```

## 📊 Mode Comparison

| Feature | Streaming Mode | Buffer Mode |
|---------|----------------|-------------|
| **Configuration** | `parseReqBody: false` | `parseReqBody: true` |
| **Large File Support** | ✅ Unlimited size | ❌ Memory limited |
| **Memory Usage** | ✅ Constant (streaming) | ⚠️ Grows with file size |
| **Retry Support** | ❌ Auto-disabled | ✅ Full support |
| **Real-time Streaming** | ✅ True streaming | ❌ Buffered transmission |
| **Use Cases** | File uploads, video streams, big data | API calls, JSON, small payloads |

## 🎯 Use Cases

### ✅ Recommended for Streaming Mode

- File uploads/downloads
- Video/audio streaming
- Large dataset transfers
- Real-time data streams
- IoT data transmission
- Log streaming

### ✅ Recommended for Buffer Mode

- REST API calls
- JSON data exchange
- Small file transfers (<10MB)
- Scenarios requiring retry mechanisms
- Scenarios requiring request body modification

## 🛡️ Security Features

### Automatic Protection Mechanisms

1. **Large File Detection**: Auto-disable retry for files >20MB
2. **Streaming Mode Detection**: Auto-disable retry when `parseReqBody: false`
3. **Memory Monitoring**: Prevent OOM errors
4. **Smart Warnings**: Clear configuration issue notifications

### Warning Message Examples

```
[koa-http-proxy] Streaming mode detected (parseReqBody: false). Retry disabled for stream safety.
[koa-http-proxy] Body size exceeds cache limit (25MB > 20MB). Retries disabled to prevent OOM.
```

## 💡 Best Practices

### 1. Route Separation

```js
// File upload routes - use streaming
app.use('/files', proxy('fileserver.com', {
  parseReqBody: false,
  limit: '1gb'
}));

// API routes - use buffer + retry
app.use('/api', proxy('apiserver.com', {
  parseReqBody: true,
  retry: true
}));
```

### 2. Conditional Configuration

```js
app.use(proxy('backend.com', {
  parseReqBody: (ctx) => {
    // Check content type
    if (ctx.headers['content-type']?.includes('multipart/form-data')) {
      return false; // streaming for file uploads
    }
    
    // Check path
    if (ctx.path.startsWith('/upload') || ctx.path.startsWith('/stream')) {
      return false; // streaming for specific paths
    }
    
    // Check size
    const size = parseInt(ctx.headers['content-length'] || '0');
    if (size > 5 * 1024 * 1024) { // 5MB
      return false; // streaming for large content
    }
    
    return true; // buffer mode for everything else
  }
}));
```

### 3. Production Environment Monitoring

```js
app.use(proxy('backend.com', {
  parseReqBody: (ctx) => {
    const size = parseInt(ctx.headers['content-length'] || '0');
    const mode = size > 10 * 1024 * 1024 ? 'streaming' : 'buffer';
    
    // Log mode selection for monitoring
    console.log(`${ctx.method} ${ctx.path}: ${mode} mode (${Math.round(size/1024)}KB)`);
    
    return mode === 'buffer';
  },
  
  retry: async (handle, ctx) => {
    const startTime = Date.now();
    let result;
    
    try {
      result = await handle();
      console.log(`API call success: ${ctx.path} (${Date.now() - startTime}ms)`);
    } catch (error) {
      console.log(`API call failed: ${ctx.path} (${error.message})`);
      throw error;
    }
    
    return result;
  }
}));
```

## 🔍 Troubleshooting

### Issue: Large file upload fails

**Solution**:
```js
// Ensure streaming mode is used
app.use('/upload', proxy('fileserver.com', {
  parseReqBody: false,  // Key: enable streaming
  limit: '500mb',       // Set appropriate size limit
  timeout: 120000       // Increase timeout
}));
```

### Issue: Retry doesn't work

**Check**:
1. Is `parseReqBody: false` set? (This disables retry)
2. Is file size >20MB? (Auto-disables retry)
3. Is the result properly returned?

### Issue: High memory usage

**Solution**:
```js
// Enable streaming for large files
app.use(proxy('backend.com', {
  parseReqBody: (ctx) => {
    const size = parseInt(ctx.headers['content-length'] || '0');
    return size < 1024 * 1024; // Use buffer for <1MB, streaming for >1MB
  }
}));
```

## 📝 Summary

- ✅ **Full Streaming Support**: Set `parseReqBody: false`
- ✅ **Two Modes Coexist**: Can use both modes in the same application
- ✅ **Automatic Safety Mechanisms**: Prevent memory overflow and configuration errors
- ✅ **Flexible Configuration**: Support conditional logic for automatic mode selection
- ⚠️ **Streaming and Retry are Mutually Exclusive**: This is a safety design consideration 