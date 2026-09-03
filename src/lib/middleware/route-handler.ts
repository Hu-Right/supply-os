/**
 * Route Handler 统一包装器（架构评估 E1/TY2）
 *
 * @module lib/middleware/route-handler
 * @description 统一承载：错误捕获 → 标准 envelope、zod 校验失败 → 400、
 *              未预期异常 → 500 + 服务端日志。业务代码用 routeError()
 *              抛业务错误，不再手写 try/catch 与错误响应样板。
 *
 * 响应契约（与存量 126 处 {code,message} 及 api-client 读取逻辑一致）：
 * - 2xx：裸载荷（不包 envelope）
 * - 4xx/5xx：{ code: number, message: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

/** 业务错误：withRoute 捕获后按 status/code/message 输出标准 envelope */
export class RouteError extends Error {
  constructor(
    public status: number,
    public code: number,
    message: string,
  ) {
    super(message);
    this.name = "RouteError";
  }
}

/** 抛出业务错误（在 withRoute 包裹的 handler 内使用） */
export function routeError(status: number, code: number, message: string): never {
  throw new RouteError(status, code, message);
}

/**
 * 解析并校验 JSON body（zod schema）。
 * - 请求体非合法 JSON → 400/40000
 * - 校验失败 → 400，message 取首个 issue；code 优先取 codeByPath[path[0]]
 *   （保持存量路由的按字段业务码，如 identifier→40011），否则 40000
 */
export async function parseJson<T>(
  req: NextRequest,
  schema: ZodType<T>,
  codeByPath: Record<string, number> = {},
): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    routeError(400, 40000, "请求体不是合法 JSON");
  }
  try {
    return schema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      const issue = err.issues[0];
      const path = String(issue?.path[0] ?? "");
      routeError(400, codeByPath[path] ?? 40000, issue?.message ?? "请求参数不合法");
    }
    throw err;
  }
}

type RouteHandler<C> = (req: NextRequest, ctx?: C) => Promise<Response> | Response;

/** 包装 Route Handler：统一错误捕获与 envelope，业务代码只写成功路径 */
export function withRoute<C>(handler: RouteHandler<C>): RouteHandler<C> {
  return async (req: NextRequest, ctx?: C) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof RouteError) {
        return NextResponse.json({ code: err.code, message: err.message }, { status: err.status });
      }
      if (err instanceof ZodError) {
        return NextResponse.json(
          { code: 40000, message: err.issues[0]?.message ?? "请求参数不合法" },
          { status: 400 },
        );
      }
      console.error(`[route] ${req.method} ${new URL(req.url).pathname}`, err);
      return NextResponse.json({ code: 50000, message: "服务器内部错误" }, { status: 500 });
    }
  };
}
