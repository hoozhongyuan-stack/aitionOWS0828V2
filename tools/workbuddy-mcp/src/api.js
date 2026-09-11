/**
 * AitionOWS 后台 API 客户端。
 *
 * 认证走 `Authorization: Bearer <token>`（对应 src/lib/auth/session.ts 的 Bearer 读取分支），
 * 令牌由 `scripts/issue-admin-token.ts` 签发。请求失败抛 AitionApiError（带 status 与后端 message），
 * 便于 MCP 工具把可操作的错误原样回给 AI。
 */

export class AitionApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "AitionApiError";
    this.status = status;
  }
}

export function createApiClient({ baseUrl, token, timeoutMs = 30000 }) {
  if (!baseUrl) throw new Error("缺少 AITION_API_BASE（官网地址，如 https://aition.art）");
  if (!token) throw new Error("缺少 AITION_API_TOKEN（用 scripts/issue-admin-token.ts 签发）");

  const root = baseUrl.replace(/\/+$/, "");

  async function request(path, { method = "GET", body, formData } = {}) {
    const url = `${root}${path}`;
    const headers = { Authorization: `Bearer ${token}` };
    if (body) headers["Content-Type"] = "application/json";

    let res;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: formData ?? (body ? JSON.stringify(body) : undefined),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw new AitionApiError(
        `无法连接官网 ${root}（${e instanceof Error ? e.message : e}）。请检查网络与 AITION_API_BASE`
      );
    }

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new AitionApiError(`响应非 JSON（HTTP ${res.status}）：${text.slice(0, 200)}`, res.status);
    }
    if (!json.ok) {
      // 401 给出可操作提示而不是把裸错误抛给 AI
      if (res.status === 401) {
        throw new AitionApiError(
          "令牌无效或已过期：请用 scripts/issue-admin-token.ts 重新签发，并更新 MCP 配置里的 AITION_API_TOKEN",
          401
        );
      }
      throw new AitionApiError(json.message || `请求失败（HTTP ${res.status}）`, res.status);
    }
    return json.data;
  }

  return {
    /** 栏目列表（含各语言名称与 moduleType） */
    listCategories: () => request("/api/admin/categories"),

    /** 内容列表 */
    listContents: (params = {}) => {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
      }
      return request(`/api/admin/contents?${qs.toString()}`);
    },

    /** 单篇（编辑态，含 translations 全文） */
    getContent: (id) => request(`/api/admin/contents?id=${encodeURIComponent(id)}`),

    /** 新建/更新（无 id = 新建，有 id = 更新） */
    saveContent: (payload) => request("/api/admin/contents", { method: "PUT", body: payload }),

    /** 上传文件（multipart）。后端返回 MediaAsset（含相对 uploads/ 的 path），这里补出可直接入库的 url */
    async uploadFile({ buffer, filename, mime, alt }) {
      const form = new FormData();
      form.append("file", new Blob([buffer], { type: mime }), filename);
      if (alt) form.append("alt", alt);
      const asset = await request("/api/admin/upload", { method: "POST", formData: form });
      const url = asset?.path ? `/uploads/${String(asset.path).replace(/^\/+/, "")}` : null;
      return { ...asset, url };
    },

    /** 拼出官网绝对地址（回执里给用户可点的链接） */
    absolute: (path) => `${root}${path.startsWith("/") ? path : `/${path}`}`,
  };
}
