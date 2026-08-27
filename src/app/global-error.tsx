"use client";

/**
 * 全局 500 错误页(必须自带 <html>/<body>,因为它替换根布局)。
 * 后续:可由后台配置自定义错误文案;可接入错误上报。
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
        <h1 style={{ fontSize: "3rem", fontWeight: 700 }}>500</h1>
        <p>服务出错了 / Something went wrong</p>
        <button
          onClick={() => reset()}
          style={{
            padding: "0.5rem 1rem",
            border: "1px solid #ccc",
            borderRadius: "0.5rem",
            cursor: "pointer",
          }}
        >
          重试 / Retry
        </button>
      </body>
    </html>
  );
}
