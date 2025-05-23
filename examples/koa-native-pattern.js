"use strict";

const Koa = require("koa");
const proxy = require("../index");

const app = new Koa();

console.log("🎯 Koa Native Middleware Pattern Demo");
console.log("");

// Middleware counter to verify execution flow
let middlewareCount = 0;

// Route 1: Don't pass next - stop after proxy
app.use(async (ctx, next) => {
  if (ctx.path.startsWith("/stop-after-proxy")) {
    console.log("🛑 Don't pass next parameter - stop after proxy");

    // 🎯 Key: Don't pass next parameter
    return proxy("https://httpbin.org", {
      debug: true,
      proxyReqPathResolver: (ctx) => {
        // Transform /stop-after-proxy/get to /get
        return ctx.path.replace("/stop-after-proxy", "");
      },
    })(ctx); // Note: didn't pass next
  }

  await next();
});

// Route 2: Pass next - continue after proxy
app.use(async (ctx, next) => {
  if (ctx.path.startsWith("/continue-after-proxy")) {
    console.log("▶️ Pass next parameter - continue after proxy");

    // 🎯 Key: Pass next parameter
    return proxy("https://httpbin.org", {
      debug: true,
      proxyReqPathResolver: (ctx) => {
        // Transform /continue-after-proxy/get to /get
        return ctx.path.replace("/continue-after-proxy", "");
      },
    })(ctx, next); // Note: passed next
  }

  await next();
});

// Route 3: Dynamically decide whether to continue
app.use(async (ctx, next) => {
  if (ctx.path.startsWith("/dynamic")) {
    const shouldContinue = ctx.query.continue === "true";
    console.log(`🔄 Dynamic decision: ${shouldContinue ? "continue execution" : "stop execution"}`);

    const proxyFn = proxy("https://httpbin.org", {
      debug: true,
      proxyReqPathResolver: (ctx) => {
        // Transform /dynamic/get to /get
        return ctx.path.replace("/dynamic", "");
      },
    });

    if (shouldContinue) {
      return proxyFn(ctx, next); // Pass next
    } else {
      return proxyFn(ctx); // Don't pass next
    }
  }

  await next();
});

// Second middleware: verify if executed
app.use(async (ctx, next) => {
  middlewareCount++;
  console.log(`📊 Second middleware executed! Count: ${middlewareCount}`);
  await next();
});

// Third middleware: final response (if no previous response)
app.use(async (ctx, next) => {
  if (!ctx.body && !ctx.headerSent) {
    ctx.body = "✅ All middleware executed - this is default response";
    console.log("📝 Third middleware: set default response");
  }
  await next();
});

app.listen(3005, () => {
  console.log("🚀 Koa Native Pattern Example Server started on port 3005");
  console.log("");
  console.log("🧪 Test Scenarios:");
  console.log("");
  console.log("1️⃣ Don't pass next - stop after proxy:");
  console.log("   curl http://localhost:3005/stop-after-proxy/get");
  console.log("   → ❌ Won't see 'Second middleware executed' log");
  console.log("");
  console.log("2️⃣ Pass next - continue after proxy:");
  console.log("   curl http://localhost:3005/continue-after-proxy/get");
  console.log("   → ✅ Will see 'Second middleware executed' log");
  console.log("");
  console.log("3️⃣ Dynamic control - don't continue:");
  console.log("   curl http://localhost:3005/dynamic/get");
  console.log("   → ❌ Won't see 'Second middleware executed' log");
  console.log("");
  console.log("4️⃣ Dynamic control - continue:");
  console.log("   curl 'http://localhost:3005/dynamic/get?continue=true'");
  console.log("   → ✅ Will see 'Second middleware executed' log");
  console.log("");
  console.log("💡 Core Concepts:");
  console.log("   • proxy()(ctx)      → Stop after proxy");
  console.log("   • proxy()(ctx, next) → Continue after proxy");
  console.log("   • Fully follows Koa native middleware pattern!");
});
