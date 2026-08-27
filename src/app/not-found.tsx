import Link from "next/link";

/**
 * 全局 404(顶层未匹配路径的兜底,无 locale 上下文)。
 * 语言内的 404 由 src/app/[locale]/not-found.tsx 处理。
 * 后续:可由后台配置自定义 404 文案/跳转。
 */
export default function NotFound() {
  return (
    <html lang="zh-CN">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h1 style={{ fontSize: "3rem", fontWeight: 700 }}>404</h1>
        <p>页面不存在 / Page not found</p>
        <Link href="/" style={{ textDecoration: "underline" }}>
          返回首页 / Back to home
        </Link>
      </body>
    </html>
  );
}
