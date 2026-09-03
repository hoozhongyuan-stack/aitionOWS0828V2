# TASK-103 GREEN — OG 实现

- Run: run-20260901-v31-specs-og-dashboard
- Agent: implementer-B-v31
- Test: `tests/app/og-tags.test.ts`(TEST-202 / TEST-203)
- 首次 GREEN 命令: `npx vitest run tests/app/og-tags.test.ts`
- 退出码: **0**
- UTC 时间戳: 2026-09-03T10:26:15Z

```
Test Files  1 passed (1)
Tests  8 passed (8)
```

## 实现落点(GREEN 变更)

- 新增 `src/lib/seo/open-graph.ts`:`buildOpenGraph({title, description, imagePath?, locale})`(async,内部取品牌配置)+ `resolveMetadataTitle()` + `siteBaseUrl()`;图片兜底链=imagePath(相对→绝对)→ LOGO 绝对 → 省略 og:image。
- `src/app/[locale]/layout.tsx`:`metadataBase: new URL(NEXT_PUBLIC_SITE_URL ?? http://localhost:3000)`。
- `(site)/page.tsx`(首页):OG=SeoMeta(home) title/description + 首条启用 Banner imageUrl(无则 LOGO)。
- `(site)/c/[slug]/page.tsx`:OG=栏目翻译名+描述 + `listPublishedByCategory(...)[0]?.coverUrl`(publishAt desc,id desc,树内已过滤);`!data` 分支维持 `{}`(不输出 OG)。
- `(site)/contact/page.tsx`:OG=SeoMeta(contact) + LOGO。
- `(site)/article/[slug]/page.tsx`、`(site)/product/[slug]/page.tsx`:改走 `buildOpenGraph`(语义不变:商品 og:image=图集首图;type 由页面 spread 保留 article/website)。

## 后续全量确认(含并发修正)

- 全量首跑发现 `tests/app` 下两个 dev server 并发共用 `.next` 读写竞争 → 页面 500(og-tags 与 product-page 互扰,见 run-notes)。
- 修正:`next.config.ts` 增加 `distDir: process.env.NEXT_TEST_DIST_DIR || ".next"`,本测试注入 `NEXT_TEST_DIST_DIR=.next-test-og-tags` 隔离构建目录(生产不设置,行为不变)。
- `npx vitest run tests/app` → **0**(3 files,13 tests)@ 2026-09-03T10:35 前后
- 全量 seal: `npx vitest run` → **0**(25 files / 149 tests)@ 2026-09-03T10:42:37Z
