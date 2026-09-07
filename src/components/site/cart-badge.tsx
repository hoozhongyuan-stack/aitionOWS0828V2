"use client";

import { useSyncExternalStore } from "react";
import { cartCount, subscribe } from "@/lib/cart-store";

/** 头部购物车角标:订阅 localStorage 购物车数量,客户端渲染(零闪烁由服务端默认空处理) */
export function CartBadge() {
  const count = useSyncExternalStore(subscribe, cartCount, () => 0);
  if (count <= 0) return null;
  return (
    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
}
