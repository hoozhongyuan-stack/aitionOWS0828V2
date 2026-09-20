/**
 * AI 爬虫白名单 —— **单一事实来源**(V4.8.2)。
 *
 * 为什么要有这个文件:此前 robots.txt 的 AI 分组(9 个)与 GEO 识别表(18 个)各自
 * 维护一份,漂移后出现「策略说禁止抓取、统计说它来了」的语义矛盾(用户报障 P1)。
 * 现在两处都从这里派生:
 *   - `src/app/robots.ts`      → userAgent: 全部 token(后台关闭 aiCrawlAllow 时整组 Disallow)
 *   - `src/server/geo/index.ts` → AI_BOTS: match = token.toLowerCase(),名称取 name
 *
 * 新增引擎只改这里一处。
 *
 * ⚠️ **顺序敏感**:GEO 侧按数组顺序做「小写包含匹配」,子串关系必须**长词在前**。
 *    当前唯一一组:`Applebot-Extended` 必须排在 `Applebot` 之前,否则
 *    `Applebot-Extended/1.0` 会被先匹配成 `Applebot`。新增条目时请一并检查。
 */
export interface AiCrawlerEntry {
  /** robots.txt 的 User-Agent token(规范写法;匹配时大小写不敏感) */
  token: string;
  /** 后台与 GEO 报表里的显示名 */
  name: string;
}

export const AI_CRAWLERS: readonly AiCrawlerEntry[] = [
  { token: "GPTBot", name: "GPTBot (OpenAI)" },
  { token: "OAI-SearchBot", name: "OAI-SearchBot (OpenAI 检索)" },
  { token: "ChatGPT-User", name: "ChatGPT-User (OpenAI 用户触发)" },
  { token: "PerplexityBot", name: "PerplexityBot" },
  { token: "Perplexity-User", name: "Perplexity-User" },
  { token: "ClaudeBot", name: "ClaudeBot (Anthropic)" },
  { token: "Claude-User", name: "Claude-User (Anthropic 用户触发)" },
  { token: "Google-Extended", name: "Google-Extended (Gemini 训练)" },
  { token: "GoogleOther", name: "GoogleOther" },
  // —— Apple: -Extended 必须在前(见文件头顺序说明)——
  { token: "Applebot-Extended", name: "Applebot-Extended (Apple 智能)" },
  // V4.8.2:Applebot 统一进 AI 口径(此前只在 robots 组里,不在 GEO 识别表 → 两表漂移)
  { token: "Applebot", name: "Applebot (Apple 搜索/Siri)" },
  { token: "Bytespider", name: "Bytespider (字节·豆包)" },
  { token: "DeepSeekBot", name: "DeepSeekBot" },
  // 国内引擎增补(V3.3 C3,UA 已核实自 ai-robots-txt 清单):
  // 腾讯混元/元宝与百度无公开声明的 AI 爬虫 UA(EdgeOne 官方清单亦未收录),故不入表;
  // Baiduspider 属传统搜索爬虫(见 SEARCH_BOTS),计入会污染 GEO 口径。
  { token: "KimiBot", name: "KimiBot (月之暗面 Kimi)" },
  { token: "Kimi-SearchBot", name: "Kimi-SearchBot (Kimi 检索)" },
  { token: "Kimi-User", name: "Kimi-User (Kimi 用户触发)" },
  { token: "ChatGLM-Spider", name: "ChatGLM-Spider (智谱清言)" },
  { token: "TongyiBot", name: "TongyiBot (阿里通义)" },
  { token: "PanguBot", name: "PanguBot (华为盘古)" },
];
