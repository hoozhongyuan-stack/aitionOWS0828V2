import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn/ui 类名合并工具:条件类名 + Tailwind 冲突去重 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { routing } from "@/i18n/routing";

/**
 * Intl 安全 locale:动态段里的 locale 可能是任意字符串(如爬虫打的 /favicon.ico 会被
 * 解析成 locale="favicon.ico"),直接传入 toLocaleDateString 会抛 RangeError。
 * 校验 BCP-47 基本形态,非法则回退默认语言。
 */
export function safeDateLocale(locale: string | undefined | null): string {
  return locale && /^[a-zA-Z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(locale) ? locale : routing.defaultLocale;
}
