# TASK-103 RED — OG(首页/栏目/联系页 openGraph + 详情页回归锁)

- Run: run-20260901-v31-specs-og-dashboard
- Agent: implementer-B-v31
- Task: TASK-103(REQ-003/004,AC-004/005)
- Test: `tests/app/og-tags.test.ts`(TEST-202 / TEST-203)
- 命令: `npx vitest run tests/app/og-tags.test.ts`
- 退出码: **1**
- UTC 时间戳: 2026-09-03T10:23:35Z

## 结果

```
Test Files  1 failed (1)
Tests  7 failed | 1 passed (8)
```

RED 失败均为行为缺失(非基建故障),对照预期 RED:

| 用例 | 失败证据(节选) |
| --- | --- |
| 首页 og:title/description/image | `AssertionError: the given combination of arguments (null and string) is invalid` → og meta 缺失 |
| 栏目页(有内容)og | 同上 → og meta 缺失 |
| 无封面栏目 og:image=LOGO | 同上 → og:image 缺失 |
| 联系页 og | 同上 → og meta 缺失 |
| 文章详情 og:image 绝对 URL | `expected 'http://localhost:38695/uploads/og-cover.webp' to be 'http://localhost:3000/...'` → 无 metadataBase,Next 回退 dev 端口 host |
| 无封面文章 og:image=LOGO | `expected null to be 'http://localhost:3000/uploads/og-logo.webp'` → 无兜底 |
| 商品详情 og:image=图集首图 | `expected 'http://localhost:38695/...' to be 'http://localhost:3000/...'` → host 不符 |
| 栏目页不存在 slug → 404 | **通过(基线行为锁)**,预期内的 RED 期通过 |

## 测试基建

- 沿用 `tests/app/product-page.test.ts` 集成模式:vitest 内 spawn `next dev`(随机端口,`DATABASE_URL=TEST_DB_URL` 指向全局临时测试库),seed 含 brand.logoUrl Setting、SeoMeta(home/contact)、启用 Banner、有内容/无内容栏目、有封面/无封面文章、带图集商品。
- 结论:RED 成立,进入 GREEN。
