import { NextResponse } from "next/server";
import type { ZodType } from "zod";

/**
 * API 统一响应与请求体校验工具。
 * 约定:所有接口返回 { ok: boolean, data?, message? } 结构。
 */

/** 成功响应 */
export function jsonOk<T>(data?: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data: data ?? null }, init);
}

/** 失败响应 */
export function jsonErr(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

/** 解析并校验 JSON 请求体;失败时直接返回可用的错误响应 */
export async function parseBody<T>(
  req: Request,
  schema: ZodType<T>
): Promise<{ data: T; error?: undefined } | { data?: undefined; error: NextResponse }> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { error: jsonErr("请求体不是合法 JSON") };
  }
  const r = schema.safeParse(json);
  if (!r.success) {
    const first = r.error.issues[0];
    return { error: jsonErr(`参数错误:${first?.path?.join(".") ?? ""} ${first?.message ?? ""}`.trim()) };
  }
  return { data: r.data };
}

/** 从请求中提取客户端 IP(本地部署常见于反代 X-Forwarded-For) */
export function getClientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}
