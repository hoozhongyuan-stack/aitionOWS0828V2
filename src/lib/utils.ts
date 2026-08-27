import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn/ui 类名合并工具:条件类名 + Tailwind 冲突去重 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
