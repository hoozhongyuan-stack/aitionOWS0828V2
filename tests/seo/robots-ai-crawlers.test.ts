import { describe, expect, it } from "vitest";
import { AI_CRAWLERS } from "@/lib/seo/ai-crawlers";

/**
 * robots.txt 的 AI 分组 与 GEO 识别表的一致性(V4.8.2 修复)。
 *
 * 回归背景:robots 曾本地硬编码 9 个爬虫,而 GEO 识别表有 18 个 —— 漂移导致后台关闭
 * aiCrawlAllow 时漏封 10 个爬虫(它们落到 * 组继续抓),却又被 GEO 计为"AI 引擎抓取",
 * 出现「策略说禁止、统计说来了」的语义矛盾。现在两处同源,这里把不变量锁死。
 */

type Rules = { userAgent: string | string[]; allow?: string | string[]; disallow?: string | string[] };

/** 从 robots() 的返回里取出 AI 分组(AI_CRAWLERS 派生的那一组) */
async function getAiGroup(withAi: boolean) {
  const { prisma } = await import("@/lib/db");
  await prisma.setting.deleteMany({ where: { group: "seo", key: "aiCrawlAllow" } });
  if (!withAi) {
    await prisma.setting.create({
      data: { group: "seo", key: "aiCrawlAllow", value: "false" },
    });
  }
  const { invalidateSettingCache } = await import("@/server/setting");
  invalidateSettingCache("seo");
  const mod = await import("@/app/robots");
  const out = (await mod.default()) as unknown as { rules: Rules | Rules[] };
  const rules = Array.isArray(out.rules) ? out.rules : [out.rules];
  const ai = rules.find((r) => Array.isArray(r.userAgent) && !r.userAgent.includes("*"));
  return { ai, all: rules };
}

describe("robots AI 分组 ⊇ GEO 识别表(V4.8.2 回归守卫)", () => {
  it("robots 的 AI 组覆盖 AI_CRAWLERS 的全部 token", async () => {
    const { ai } = await getAiGroup(true);
    expect(ai, "未找到 AI 分组").toBeTruthy();
    const tokens = (ai!.userAgent as string[]).map((t) => t.toLowerCase());
    for (const crawler of AI_CRAWLERS) {
      expect(tokens, `${crawler.token} 未进入 robots AI 组`).toContain(crawler.token.toLowerCase());
    }
    expect(tokens.length).toBe(AI_CRAWLERS.length);
  });

  it("GEO 识别表(AI_BOTS)由同一份名单派生,两处逐条对应", async () => {
    const { AI_BOTS } = await import("@/server/geo");
    expect(AI_BOTS.length).toBe(AI_CRAWLERS.length);
    for (let i = 0; i < AI_CRAWLERS.length; i++) {
      expect(AI_BOTS[i].match).toBe(AI_CRAWLERS[i].token.toLowerCase());
      expect(AI_BOTS[i].name).toBe(AI_CRAWLERS[i].name);
    }
  });

  it("关闭 AI 抓取开关时:AI 组整组 Disallow,且不影响 * 组", async () => {
    const { ai, all } = await getAiGroup(false);
    expect(ai!.disallow).toBe("/");
    const star = all.find((r) => r.userAgent === "*")!;
    expect(star.disallow).not.toBe("/");
  });

  it("开启(默认)时:AI 组 Allow / 并排除后台与接口", async () => {
    const { ai } = await getAiGroup(true);
    expect(ai!.allow).toBe("/");
    expect(ai!.disallow as string[]).toEqual(expect.arrayContaining(["/admin", "/api"]));
  });
});

describe("匹配顺序守卫:长词必须先于短词", () => {
  it("Applebot-Extended 的 UA 必须识别为 Applebot-Extended,而不是 Applebot", async () => {
    const { matchBot } = await import("@/server/geo");
    expect(matchBot("Mozilla/5.0 Applebot-Extended/0.1")).toBe("Applebot-Extended (Apple 智能)");
    expect(matchBot("Mozilla/5.0 (compatible; Applebot/0.1)")).toBe("Applebot (Apple 搜索/Siri)");
  });

  it("名单里不存在「短词排在长词之前」的其它子串冲突", () => {
    const tokens = AI_CRAWLERS.map((c) => c.token.toLowerCase());
    const violations: string[] = [];
    tokens.forEach((short, i) => {
      tokens.forEach((long, j) => {
        if (i < j && long.includes(short) && long !== short) violations.push(`${short} 在 ${long} 之前`);
      });
    });
    expect(violations).toEqual([]);
  });

  it("新增的 10 个爬虫都能被识别(逐个 UA 抽查)", async () => {
    const { matchBot } = await import("@/server/geo");
    const cases: [string, string][] = [
      ["Perplexity-User/1.0", "Perplexity-User"],
      ["Claude-User/1.0", "Claude-User (Anthropic 用户触发)"],
      ["GoogleOther", "GoogleOther"],
      ["DeepSeekBot/1.0", "DeepSeekBot"],
      ["KimiBot/1.0", "KimiBot (月之暗面 Kimi)"],
      ["Kimi-SearchBot/1.0", "Kimi-SearchBot (Kimi 检索)"],
      ["Kimi-User/1.0", "Kimi-User (Kimi 用户触发)"],
      ["ChatGLM-Spider/1.0", "ChatGLM-Spider (智谱清言)"],
      ["TongyiBot/1.0", "TongyiBot (阿里通义)"],
      ["PanguBot/1.0", "PanguBot (华为盘古)"],
    ];
    for (const [ua, expected] of cases) {
      expect(matchBot(ua), ua).toBe(expected);
    }
  });
});
