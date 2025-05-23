"use strict";

const Koa = require("koa");
const proxy = require("../index");

const proxyUrl = "https://httpbin.org";

new Koa()
  .use(async (ctx, next) => {
    const start = Date.now();
    console.info(`- ${ctx.method} ${ctx.url}`);
    await next();
    const latency = Date.now() - start;
    const userAgent = ctx.request.headers["user-agent"] || "";

    console.info(
      `- ${ctx.method} ${ctx.url} ${ctx.status} "${userAgent}" - ${latency}ms`,
    );
  })
  .use(
    proxy(proxyUrl, {
      debug: { enabled: true, includeBody: true },
      // Simple retry: execute 3 times regardless of success/failure
      retry: async (handle, ctx) => {
        const maxAttempts = 3;
        let attempt = 0;
        let result;

        while (attempt++ < maxAttempts) {
          console.info(`Attempt ${attempt} of ${maxAttempts}`);
          result = await handle();
          console.info(
            `Attempt ${attempt} result: ${result.proxy.res?.statusCode}`,
          );
        }

        // CRITICAL FIX: Must return the final result!
        return result;
      },

      proxyReqOptDecorator(proxyReqOpts, ctx) {
        console.info(`Proxy Request: ${ctx.method} ${proxyUrl}${ctx.path}`);
        return proxyReqOpts;
      },

      userResDecorator(proxyRes, proxyResData, ctx) {
        console.info(
          `Proxy Response: ${proxyRes.statusCode} ${proxyRes.statusMessage} for ${ctx.method} ${proxyUrl}${ctx.path}`,
        );
        return proxyResData;
      },
    }),
  )
  .listen({ port: 5006 }, () => {
    console.log("Server started on port 5006");
    console.log("");
    console.log("Test commands:");
    console.log("curl http://localhost:5006/get  # Will execute 3 times");
    console.log(
      'curl -H "Content-Type: application/json" -d \'{"hello":"world"}\' http://localhost:5006/post  # Will execute 3 times',
    );
    console.log(
      "curl http://localhost:5006/status/500  # Will execute 3 times even on 500 error",
    );
  });
