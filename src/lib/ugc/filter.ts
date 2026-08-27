import { prisma } from "@/lib/db";

/**
 * 敏感词过滤(需求 4.8 安全机制):
 * 词库存 SensitiveWord 表,进程缓存;命中策略 = 拒绝提交(降低审核压力)。
 */

const g = globalThis as unknown as { __aitionWords?: string[] | null };

export async function getSensitiveWords(): Promise<string[]> {
  if (g.__aitionWords) return g.__aitionWords;
  const rows = await prisma.sensitiveWord.findMany({ select: { word: true } });
  g.__aitionWords = rows.map((r) => r.word).filter(Boolean);
  return g.__aitionWords;
}

export function invalidateWordsCache(): void {
  g.__aitionWords = null;
}

/** 返回命中的敏感词(未命中返回 null) */
export async function findSensitiveWord(text: string): Promise<string | null> {
  if (!text) return null;
  const words = await getSensitiveWords();
  const lower = text.toLowerCase();
  for (const w of words) {
    if (w && lower.includes(w.toLowerCase())) return w;
  }
  return null;
}
