/**
 * Route Handler 统一包装器（架构评估 E1/TY2；ADR-0021 envelope 升级）
 *
 * @module lib/middleware/route-handler
 * @description 统一承载：错误捕获 → 标准 envelope、zod 校验失败 → 400、
 *              未预期异常 → 500 + 服务端日志。业务代码用 routeError()
 *              抛业务错误，不再手写 try/catch 与错误响应样板。
 *
 * 响应契约（ADR-0021 §2.2，RFC 9457 兼容超集）：
 * - 2xx：裸载荷（不包 envelope）
 * - 4xx/5xx：{ code, message, error: { type, code, status, kind }, detail }
 *   - error.type 为稳定字符串错误标识主键（由 catalog 按 code 反查）；
 *   - detail 收纳全部结构化附加数据（原 extra 顶层展开废弃，camelCase 统一）；
 *   - 顶层 code/message 保留为兼容层。
 * - 手写错误响应（SSE 前置检查等无法走 withRoute 的场景）统一用 errorEnvelope()。
 */
import { NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { EC_INTERNAL_ERROR, EC_INVALID_PARAMS } from "@/shared/constants/api";
import { lookupErrorDef } from "@/shared/errors/catalog";
import { runWithRequestCache } from "./request-cache";

/** 业务错误：withRoute 捕获后按 status/code/message 输出标准 envelope */
export class RouteError extends Error {
  /** 附加到响应 envelope 的结构化数据（进 detail 容器；camelCase 统一） */
  public extra?: Record<string, unknown>;
  constructor(
    public status: number,
    public code: number,
    message: string,
    extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RouteError";
    this.extra = extra;
  }
}

/** 抛出业务错误（在 withRoute 包裹的 handler 内使用） */
export function routeError(status: number, code: number, message: string, extra?: Record<string, unknown>): never {
  throw new RouteError(status, code, message, extra);
}

/**
 * 按 ADR-0021 契约构建错误 envelope（供 withRoute 与少量无法走 withRoute 的场景复用）。
 * type/kind 由 catalog 按 code 反查；未登记码回落 internal_error（门禁会拦截未登记新码）。
 */
export function errorEnvelope(
  status: number,
  code: number,
  message: string,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const def = lookupErrorDef(code);
  return {
    code,
    message,
    error: {
      type: def?.type ?? "internal_error",
      code,
      status,
      kind: def?.kind ?? "system",
    },
    detail: extra ?? {},
  };
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
    routeError(400, EC_INVALID_PARAMS, "请求体不是合法 JSON");
  }
  try {
    return schema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      const issue = err.issues[0];
      const path = String(issue?.path[0] ?? "");
      routeError(400, codeByPath[path] ?? EC_INVALID_PARAMS, issue?.message ?? "请求参数不合法");
    }
    throw err;
  }
}

type RouteHandler<C> = (req: NextRequest, ctx: C) => Promise<Response> | Response;

/** 包装 Route Handler：统一错误捕获与 envelope，业务代码只写成功路径。
 *  外层签名 ctx 可选（兼容测试单参调用），内层 handler 拿到非可选 ctx（Next 恒传入）。
 *  同时建立「单次请求」作用域（request-cache）：同请求内重复判权/取矩阵只落一次库。 */
export function withRoute<C>(handler: RouteHandler<C>): (req: NextRequest, ctx?: C) => Promise<Response> {
  return async (req: NextRequest, ctx?: C) => {
    try {
      return await runWithRequestCache(() => handler(req, ctx as C));
    } catch (err) {
      if (err instanceof RouteError) {
        return NextResponse.json(errorEnvelope(err.status, err.code, err.message, err.extra), { status: err.status });
      }
      if (err instanceof ZodError) {
        const issue = err.issues[0];
        return NextResponse.json(
          errorEnvelope(400, EC_INVALID_PARAMS, issue?.message ?? "请求参数不合法"),
          { status: 400 },
        );
      }
      console.error(`[route] ${req.method} ${new URL(req.url).pathname}`, err);
      return NextResponse.json(errorEnvelope(500, EC_INTERNAL_ERROR, "服务器内部错误"), { status: 500 });
    }
  };
}
