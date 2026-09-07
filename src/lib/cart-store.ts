"use client";

/**
 * 购物车(V4.0 · 客户端方案):localStorage 持久化 + useSyncExternalStore 订阅。
 * 条目里的 title/price/coverUrl 仅作展示快照;**结算下单时服务端按现价重算**,
 * 前端数据不作为计价依据(防篡改)。零依赖,跨组件(header 角标/加购按钮/购物车页)共享。
 */

export interface CartLine {
  contentId: number;
  slug: string;
  title: string;
  priceCents: number;
  currency: string;
  coverUrl?: string | null;
  qty: number;
}

const KEY = "aition_cart_v1";
const MAX_QTY = 99;
const MAX_LINES = 50;

let lines: CartLine[] = load();
const listeners = new Set<() => void>();

function load(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (l): l is CartLine =>
          !!l &&
          typeof l === "object" &&
          typeof (l as CartLine).contentId === "number" &&
          typeof (l as CartLine).qty === "number"
      )
      .map((l) => ({ ...l, qty: Math.min(MAX_QTY, Math.max(1, Math.floor(l.qty))) }));
  } catch {
    return [];
  }
}

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    /* 存储满/隐私模式:静默,内存态仍可用 */
  }
  listeners.forEach((fn) => fn());
}

export function getCartLines(): CartLine[] {
  return lines;
}

export function cartCount(): number {
  return lines.reduce((n, l) => n + l.qty, 0);
}

/** 加购;同商品累加数量。服务端校验以结算时为准,这里只做展示层上限 */
export function addToCart(line: Omit<CartLine, "qty">, qty = 1) {
  const found = lines.find((l) => l.contentId === line.contentId);
  if (found) {
    found.qty = Math.min(MAX_QTY, found.qty + Math.max(1, qty));
  } else if (lines.length < MAX_LINES) {
    lines = [...lines, { ...line, qty: Math.min(MAX_QTY, Math.max(1, qty)) }];
  }
  persist();
}

export function setQty(contentId: number, qty: number) {
  if (qty <= 0) {
    removeLine(contentId);
    return;
  }
  lines = lines.map((l) => (l.contentId === contentId ? { ...l, qty: Math.min(MAX_QTY, qty) } : l));
  persist();
}

export function removeLine(contentId: number) {
  lines = lines.filter((l) => l.contentId !== contentId);
  persist();
}

export function clearCart() {
  lines = [];
  persist();
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 跨标签页同步 */
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      lines = load();
      listeners.forEach((fn) => fn());
    }
  });
}
