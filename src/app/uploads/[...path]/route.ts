import { NextRequest, NextResponse } from "next/server";
import { stat } from "node:fs/promises";
import path from "node:path";
import { safeResolve } from "@/lib/storage";

/**
 * 本地上传资源输出(需求:本地上传资源通过应用路由代理输出,无需外部图片域名):
 *   GET /uploads/<yyyy>/<MM>/<uuid>.<ext>
 * - 路径穿越防护:safeResolve 限定在 uploads 根内
 * - Content-Type 按扩展名映射(saveUpload 的 EXT_BY_MIME 决定了磁盘上只会出现这些扩展名)
 * - SVG/所有响应加 CSP sandbox + nosniff:阻断 SVG 内嵌脚本的存储型 XSS
 * - ETag/304 与单区间 Range(iOS Safari 视频播放必需)
 */

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  mp4: "video/mp4",
  pdf: "application/pdf",
};

// uuid 文件名内容永不变化 → 一年强缓存
const CACHE_CONTROL = "public, max-age=31536000, immutable";
// sandbox 禁脚本仍可显示图片/视频/PDF;style-src 'unsafe-inline' 保住 PDF 内部样式渲染
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
};

/** 弱 ETag:mtime+size 已足够(uuid 名保证内容不变) */
function makeEtag(mtimeMs: number, size: number): string {
  return `"${Math.floor(mtimeMs).toString(36)}-${size.toString(36)}"`;
}

interface FileMeta {
  abs: string;
  size: number;
  mtimeMs: number;
  mime: string;
}

async function resolveFile(segments: string[]): Promise<FileMeta | null> {
  // 解码后的分段再拼接,交由 safeResolve 做包含性校验(拦截 ../ 等)
  const rel = segments.join("/");
  const abs = safeResolve(rel);
  if (!abs) return null;
  try {
    const s = await stat(abs);
    if (!s.isFile()) return null;
    const ext = path.extname(abs).replace(".", "").toLowerCase();
    return { abs, size: s.size, mtimeMs: s.mtimeMs, mime: MIME_BY_EXT[ext] ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await ctx.params;
  const file = await resolveFile(Array.isArray(segments) ? segments : []);
  if (!file) return new NextResponse("Not Found", { status: 404 });

  const etag = makeEtag(file.mtimeMs, file.size);
  const baseHeaders = {
    ...SECURITY_HEADERS,
    "Content-Type": file.mime,
    "Cache-Control": CACHE_CONTROL,
    ETag: etag,
    "Accept-Ranges": "bytes",
  };

  // 条件请求:命中直接 304
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: baseHeaders });
  }

  let start = 0;
  let end = file.size - 1;
  let status = 200;

  // 单区间 Range(多区间直接回全量,浏览器不会用到)
  const range = req.headers.get("range");
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m && (m[1] || m[2])) {
      if (m[1]) {
        start = parseInt(m[1], 10);
        end = m[2] ? Math.min(parseInt(m[2], 10), end) : end;
      } else {
        // bytes=-N:取末尾 N 字节
        start = Math.max(0, file.size - parseInt(m[2], 10));
      }
      if (start > end || start >= file.size) {
        return new NextResponse(null, {
          status: 416,
          headers: { ...baseHeaders, "Content-Range": `bytes */${file.size}` },
        });
      }
      status = 206;
    }
  }

  const nodeFs = await import("node:fs");
  const stream = nodeFs.createReadStream(file.abs, { start, end });
  return new NextResponse(stream as unknown as ReadableStream, {
    status,
    headers: {
      ...baseHeaders,
      ...(status === 206 ? { "Content-Range": `bytes ${start}-${end}/${file.size}` } : {}),
      "Content-Length": String(end - start + 1),
    },
  });
}
