"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** 站点访问统计埋点:路由变化时上报 PV/UV(visitorId 本地持久化) */
export function PageTracker() {
  const pathname = usePathname();

  useEffect(() => {
    let visitorId = localStorage.getItem("aition_vid");
    if (!visitorId) {
      visitorId = crypto.randomUUID();
      localStorage.setItem("aition_vid", visitorId);
    }
    fetch("/api/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: pathname, visitorId }),
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);

  return null;
}
