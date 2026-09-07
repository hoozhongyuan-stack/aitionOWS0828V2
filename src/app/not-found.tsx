import Link from "next/link";
import { getBrandConfig, getErrorPagesConfig } from "@/lib/config";

/**
 * 全局 404(根级):处理 middleware matcher 之外的未匹配路径
 * (如带点文件名 /foo.txt、资源类路径)——[locale]/not-found.tsx 覆盖不到的场景。
 * 与 global-error.tsx 同理:渲染在 [locale] 布局壳之外,不用 tailwind 类,样式内联。
 * 文案取后台「功能设置 → 错误页」配置;回首页链接由 middleware 重定向到默认语言。
 */
export default async function GlobalNotFound() {
  const [cfg, brand] = await Promise.all([
    getErrorPagesConfig().catch(() => null),
    getBrandConfig().catch(() => null),
  ]);

  return (
    <main
      style={{
        display: "flex",
        minHeight: "70vh",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        padding: "0 1rem",
        textAlign: "center",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <p style={{ fontSize: "0.875rem", color: "#888" }}>{brand?.siteName || "AitionOWS"}</p>
      <h1 style={{ fontSize: "3.75rem", fontWeight: 700, color: "#6366f1", lineHeight: 1 }}>
        {cfg?.notFoundTitle || "404"}
      </h1>
      <p style={{ color: "#666" }}>{cfg?.notFoundDesc || "页面不存在或已被移除"}</p>
      <Link
        href="/"
        style={{
          padding: "0.5rem 1rem",
          border: "1px solid #ccc",
          borderRadius: "0.5rem",
          color: "inherit",
          textDecoration: "none",
        }}
      >
        返回首页 / Back Home
      </Link>
    </main>
  );
}
