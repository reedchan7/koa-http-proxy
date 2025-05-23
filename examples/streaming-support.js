"use strict";

const Koa = require("koa");
const proxy = require("../index");
const fs = require("fs");
const path = require("path");

const app = new Koa();

// Logging middleware
app.use(async (ctx, next) => {
  const start = Date.now();
  console.log(
    `→ ${ctx.method} ${ctx.url} (Content-Length: ${ctx.headers["content-length"] || "chunked"})`,
  );
  await next();
  const duration = Date.now() - start;
  console.log(`← ${ctx.method} ${ctx.url} ${ctx.status} (${duration}ms)`);
});

// Route 1: Streaming mode (parseReqBody: false) - supports large files and streaming
app.use(
  "/stream",
  proxy("httpbin.org", {
    parseReqBody: false, // ✅ Enable streaming mode
    retry: true, // Will be automatically disabled for streaming safety

    proxyReqOptDecorator(proxyReqOpts, ctx) {
      console.log(
        `  → Streaming request: ${proxyReqOpts.method} ${proxyReqOpts.path}`,
      );
      return proxyReqOpts;
    },

    userResDecorator(proxyRes, proxyResData, ctx) {
      console.log(
        `  ← Streamed response: ${proxyRes.statusCode} (${proxyResData.length} bytes)`,
      );
      return proxyResData;
    },
  }),
);

// Route 2: Regular mode (parseReqBody: true) - supports retry but not streaming
app.use(
  "/api",
  proxy("httpbin.org", {
    parseReqBody: true, // Default: body will be cached in memory
    retry: async (handle, ctx) => {
      console.log(`  Custom retry for ${ctx.method} ${ctx.path}`);

      // Retry logic
      let result;
      for (let attempt = 1; attempt <= 2; attempt++) {
        console.log(`    Attempt ${attempt}/2`);
        try {
          result = await handle();
          if (result.proxy.res.statusCode < 500) break;

          if (attempt < 2) {
            console.log(`    Server error, retrying...`);
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        } catch (error) {
          if (attempt === 2) throw error;
          console.log(`    Network error, retrying...`);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      return result;
    },
  }),
);

// Route 3: Conditional logic - automatically choose between streaming and retry
app.use(
  proxy("httpbin.org", {
    // Smart configuration based on request characteristics
    parseReqBody: function (ctx) {
      const contentLength = parseInt(ctx.headers["content-length"] || "0");
      const isLargeUpload = contentLength > 1024 * 1024; // 1MB threshold
      const isFileUpload =
        ctx.path.includes("/upload") ||
        ctx.headers["content-type"]?.includes("multipart/form-data");

      // Use streaming for large uploads or file uploads
      if (isLargeUpload || isFileUpload) {
        console.log(
          `  Using streaming mode for ${ctx.path} (${Math.round(contentLength / 1024)}KB)`,
        );
        return false; // Streaming mode
      }

      console.log(`  Using buffered mode for ${ctx.path} (supports retry)`);
      return true; // Buffered mode (supports retry)
    },

    retry: async (handle, ctx) => {
      // This will only be called when parseReqBody: true (buffered mode)
      console.log(`  Retry enabled for buffered request: ${ctx.path}`);

      let result;
      for (let attempt = 1; attempt <= 2; attempt++) {
        console.log(`    Attempt ${attempt}/2`);
        result = await handle();

        if (result.proxy.res.statusCode < 500 || attempt === 2) {
          break;
        }

        console.log(`    Retrying in 500ms...`);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      return result;
    },
  }),
);

const port = 3002;
app.listen(port, () => {
  console.log(
    `Streaming Support Example Server running on http://localhost:${port}`,
  );
  console.log("");
  console.log("Test scenarios:");
  console.log("");
  console.log("🌊 Streaming Mode (parseReqBody: false):");
  console.log(
    `   curl -X POST -d @package.json http://localhost:${port}/stream/post`,
  );
  console.log(
    `   curl -X POST -H "Content-Type: text/plain" --data-binary @README.md http://localhost:${port}/stream/post`,
  );
  console.log(
    `   curl -X POST -T package.json http://localhost:${port}/stream/put`,
  );
  console.log(
    "   ↑ These support large files but retry is disabled for safety",
  );
  console.log("");
  console.log("🔄 Retry Mode (parseReqBody: true):");
  console.log(
    `   curl -X POST -H "Content-Type: application/json" -d '{"test":"small data"}' http://localhost:${port}/api/post`,
  );
  console.log(`   curl http://localhost:${port}/api/status/500  # Will retry`);
  console.log("   ↑ These support retry but cache body in memory");
  console.log("");
  console.log("🧠 Smart Mode (conditional):");
  console.log(
    `   curl -X POST -H "Content-Type: application/json" -d '{"small":"data"}' http://localhost:${port}/post`,
  );
  console.log(
    `   curl -X POST -H "Content-Length: 2000000" -d '$(head -c 2000000 /dev/zero)' http://localhost:${port}/post`,
  );
  console.log(
    `   curl -X POST -H "Content-Type: multipart/form-data" -F "file=@package.json" http://localhost:${port}/upload`,
  );
  console.log(
    "   ↑ Automatically chooses streaming vs retry based on request size/type",
  );
  console.log("");
  console.log("💡 Key points:");
  console.log(
    "   • parseReqBody: false = Streaming mode (large files OK, no retry)",
  );
  console.log(
    "   • parseReqBody: true = Buffered mode (retry OK, memory limited)",
  );
  console.log("   • parseReqBody can be a function for conditional logic");
});
