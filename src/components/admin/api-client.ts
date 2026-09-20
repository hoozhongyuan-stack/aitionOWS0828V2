"use client";

/**
 * 后台前端统一请求工具。
 * 约定服务端返回 { ok, data?, message? };失败抛出 Error(message),
 * 由调用方用 sonner toast 呈现。
 */

async function handle<T>(res: Response): Promise<T> {
  let body: { ok?: boolean; data?: T; message?: string } = {};
  try {
    body = await res.json();
  } catch {
    /* 非 JSON 响应 */
  }
  if (!res.ok || body.ok === false) {
    // V4.8.1:错误对象携带 HTTP 状态 —— 调用方可据此区分「无权限(403)」与其他失败
    const err = new Error(body.message || `请求失败(${res.status})`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return body.data as T;
}

/** 是否为「无权限」失败(403):用于把权限不足渲染成空态而不是红条提示 */
export function isForbiddenError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { status?: number }).status === 403;
}

export async function apiGet<T = unknown>(url: string): Promise<T> {
  return handle<T>(await fetch(url, { cache: "no-store" }));
}

export async function apiPost<T = unknown>(url: string, body?: unknown): Promise<T> {
  return handle<T>(
    await fetch(url, {
      method: "POST",
      headers: body instanceof FormData ? undefined : { "content-type": "application/json" },
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    })
  );
}

export async function apiPut<T = unknown>(url: string, body?: unknown): Promise<T> {
  return handle<T>(
    await fetch(url, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    })
  );
}

export async function apiDelete<T = unknown>(url: string): Promise<T> {
  return handle<T>(await fetch(url, { method: "DELETE" }));
}

/** 上传文件(后台) */
export async function apiUpload(file: File, alt?: string) {
  const fd = new FormData();
  fd.append("file", file);
  if (alt) fd.append("alt", alt);
  return apiPost<{ id: number; url: string; path: string; filename: string }>("/api/admin/upload", fd);
}

/** PATCH 请求(V4.1 子账号更新等) */
export async function apiPatch<T = unknown>(url: string, body: unknown): Promise<T> {
  return handle<T>(
    await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}
