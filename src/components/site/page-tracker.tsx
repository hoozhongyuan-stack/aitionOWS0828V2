"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * 站点访问统计埋点:路由变化时上报 PV/UV(visitorId 本地持久化)。
 *
 * V4.8.2:随首次上报携带**初始来源**(document.referrer),引荐识别由服务端移至客户端 ——
 * 只有浏览器能同时拿到"来源"与"匿名访客标识",而 GEO 的独立访客必须按人去重。
 * 模块级标记保证每次页面加载只报一次来源:SPA 内部跳转时 document.referrer 仍是首次进入
 * 的来源,重复上报会让"点击"虚高(visitorId 去重只挡访客数,挡不住点击数)。
 */
let referrerReported = false;

export function PageTracker() {
  const pathname = usePathname();

  useEffect(() => {
    let visitorId = localStorage.getItem("aition_vid");
    if (!visitorId) {
      visitorId = crypto.randomUUID();
      localStorage.setItem("aition_vid", visitorId);
    }
    const referrer = referrerReported ? undefined : document.referrer || undefined;
    referrerReported = true;
    fetch("/api/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: pathname, visitorId, referrer }),
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);

  return null;
}
