import * as koa from "koa";
import * as http from "http";

declare function koaHttpProxy(
  host: string,
  options: koaHttpProxy.IOptions,
): koa.Middleware;

declare namespace koaHttpProxy {
  export interface IRetryOptions {
    retries?: number; // maximum amount of times to retry the operation, default to 3
    maxRetryTime?: number; // The maximum time (in milliseconds) that the retried operation is allowed to run, default to Infinity
    minTimeout?: number; // The number of milliseconds before starting the first retry, default to 1000
    maxTimeout?: number; // The maximum number of milliseconds between two retries, default to Infinity
  }

  export interface IProxyContainer {
    proxy: {
      res?: http.IncomingMessage; // The response from the proxied server
      resData?: Buffer; // The response data
      req?: any;
      bodyContent?: any;
      reqBuilder?: any;
    };
    user: {
      ctx: koa.Context;
    };
    options: any;
    params: any;
  }

  export interface IOptions {
    agent?: http.Agent;
    headers?: { [key: string]: any };
    strippedHeaders?: [string];
    https?: boolean;
    limit?: string;
    parseReqBody?: boolean;
    port?: number;
    preserveHostHdr?: boolean;
    preserveReqSession?: boolean;
    reqAsBuffer?: boolean;
    reqBodyEncoding?: string | null;
    connectTimeout?: number;
    timeout?: number;
    debug?: boolean | {
      enabled: boolean;
      includeBody?: boolean;
    };
    filter?(ctx: koa.Context): boolean;
    proxyReqBodyDecorator?(
      bodyContent: string,
      ctx: koa.Context,
    ): string | Promise<string>;
    proxyReqOptDecorator?(
      proxyReqOpts: IRequestOption,
      ctx: koa.Context,
    ): IRequestOption | Promise<IRequestOption>;
    proxyReqPathResolver?(ctx: koa.Context): string | Promise<string>;
    userResDecorator?(
      proxyRes: http.IncomingMessage,
      proxyResData: string | Buffer,
      ctx: koa.Context,
    ): string | Buffer | Promise<string> | Promise<Buffer>;
    userResHeadersDecorator?(headers: {
      [key: string]: string;
    }): Promise<{ [key: string]: string }> | { [key: string]: string };
    // Retry configuration - simplified API
    retry?:
      | boolean
      | IRetryOptions
      | ((
          handle: () => Promise<IProxyContainer>,
          ctx: koa.Context,
        ) => Promise<IProxyContainer>);
  }

  export interface IRequestOption {
    hostname: string;
    port: number;
    headers: { [key: string]: any };
    method: string;
    path: string;
    bodyContent: string | Buffer;
    params: any;
  }
}

export = koaHttpProxy;
