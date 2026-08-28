import type { Metadata } from "next";

/** 后台登录页不对外索引(页面本体为客户端组件,metadata 由本服务端 layout 承载) */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
