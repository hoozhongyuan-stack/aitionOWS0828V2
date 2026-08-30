# Design: design-v1

## Approved inputs

- Spec: `.spec-tdd-sdlc/runs/run-20260830-v3-catalog-favorite-mail/spec.md`（SPEC-v3-catalog-favorite-mail v4）
- Spec SHA-256: `62bf6cffd04823b9b21c4f185ebc8bfdbed79a7a7c566215e45e1393da219897`
- G1 approval ID: APR-001（user approved @ 2026-08-30T13:58:01+0000）

## Recommended design

### Components and boundaries（页面/接口不直连 Prisma，全部经 `src/server/**`）

- **content 服务扩展**（`src/server/content/`）：
  - `resolveDetailPath(category, slug)`：按栏目 moduleType 返回 `/article/[slug]` 或 `/product/[slug]`（供 ContentCard 与服务层复用）；
  - `getProductDetail(slug, locale)`：商品详情数据组装——图集（gallery 解析，coverUrl 兜底首位）、specs 键值对（非法 JSON 容错为空）、正文、单页 TDK、询盘表单（formId → 表单 **enabled** 才返回，否则 null）；
  - 商品列表查询：按栏目（含子栏目 id 集）过滤、投影排除 gallery/specs（NFR-006）、分页沿用现有机制；
  - `listForLlms` 扩展：返回 moduleType 供 llms.txt 分区。
- **ugc 服务扩展**（`src/server/ugc/`）：`toggleFavorite({contentId, userId})`（事务：唯一约束 upsert/删除 + favoriteCount 同步增减，返回 `{favorited, favoriteCount}`）、`hasFavorited`、`listMyFavorites(userId)`（含栏目 moduleType 类型标识）。
- **user 服务扩展**（`src/server/user/`）：`toPublicUser()` 前台序列化白名单（id/email/nickname/avatarUrl——4 个隐私字段物理隔离于出口之外）；`adminUpdateProfile(id, fields)`；`listUsers({q})` 公司名模糊搜索。
- **notify 模板层**（`src/server/notify/template.ts` 新增）：纯 TS 模板函数（不引入模板引擎生产依赖）：`renderBrandEmail({heading, blocks, cta, locale})` → 品牌壳 HTML（表格布局+全内联样式，主题主色从 `getThemeConfig()` 注入，LOGO/站点名/版权取 brand 配置绝对 URL）；`renderPasswordResetEmail(locale, link, expireText)`；`renderFormSubmissionNotify(payload)`；`renderUgcPendingNotify(payload)`。用户可控字段统一 HTML 转义；`sendMail` 增加 html 直传，现有 headerSafe/超时/静默失败语义不变。
- **API**：`POST /api/interaction/favorite`；`PATCH /api/admin/users/[id]`（资料 4 字段）；`GET /api/admin/users?q=`。现有接口契约不变。
- **前台页面**：新增 `app/[locale]/(site)/product/[slug]/page.tsx`（SSR：图集查看器静态化+参数表+正文+询盘表单+ProductJsonLd+收藏按钮）；`c/[slug]/page.tsx` 按 moduleType 分支渲染商品模板；`account/page.tsx`（Tab：收藏/投稿/退出，服务端鉴权重定向）；`submissions/page.tsx` 改为 `redirect()`；`SiteHeader` 用户菜单加「个人中心」；`interaction-bar` 加收藏按钮（登录墙+回跳参数）。
- **后台页面**：`content/edit` 按栏目类型动态渲染图集上传（复用 media 组件，可排序）+ 参数键值行编辑器 + favoriteCount 查看/修改/清零（并入现有互动统计区）；`users` 页加资料编辑弹窗与公司搜索框。
- **SEO**：`components/seo/json-ld.tsx` 增 `ProductJsonLd`（name/image 绝对 URL/description/brand/category/specs 含「型号」时 sku）；`llms.txt` 路由输出「产品/文章」分区；sitemap 复用现有 content 查询自动收录商品。
- **测试基建**：`vitest.config.ts`（`@` 别名、coverage-v8、projects: node 环境）；`tests/setup/db.ts` 全局 fixture——每 run 创建临时 SQLite 文件库 → `prisma migrate deploy` → 注入 fixture → 遥测清理；`tests/smoke.test.ts`。

### Data model and lifecycle

- `Content`：+`gallery String?`（JSON 数组，MediaAsset 路径，多语言共享）、+`specs String?`（JSON `[{"k","v"}]`）、+`favoriteCount Int @default(0)`；
- `User`：+`companyName/country/province/city String?`；
- `Favorite`：`id/targetType("CONTENT")/targetId/userId/createdAt`，`@@unique([targetType,targetId,userId])`、`@@index([userId])`；内容删除时级联清理（应用层随 Content 删除事务执行）；
- 一次迁移 `2026xxxx_v3_product_favorite_user_profile`。

### Public/API contracts

| 契约 | 语义 |
| --- | --- |
| `POST /api/interaction/favorite` `{contentId}` | 登录态切换收藏 → `{favorited, favoriteCount}`；401 未登录；404 不存在/未发布 |
| `PATCH /api/admin/users/[id]` `{companyName?,country?,province?,city?}` | 全可空，保存后回显 |
| `GET /api/admin/users?q=` | 公司名 contains 模糊搜索 |
| 前台用户响应（me/login/register） | 维持既有字段集，禁止出现 4 隐私字段 |

### Authentication, authorization, privacy, and abuse controls

- 收藏：JWT 会话（复用现有 auth）强制登录；唯一约束兜底并发重复；计数在事务内变更。
- 隐私：4 字段唯一出口为 admin API（admin 会话中间件保护）；前台序列化走 `toPublicUser()` 白名单；TEST-013 断言 4 键不存在。
- 邮件：headerSafe 保持；模板对用户可控字段（昵称、表单值）HTML 转义；无新增注入面。
- 询盘：沿用表单服务端复验/防重复/限频，无新逻辑。

### Failure behavior and observability

- gallery/specs 非法 JSON → 空数组渲染，不抛 500；商品页无翻译回退默认语言（沿用现有机制）；
- 收藏目标不存在/未发布 → 404，计数不变；
- 邮件模板渲染异常/SMTP 失败 → console.error + 静默，业务不受影响（NFR-004）；
- 可观测：沿用现有 console 日志与 PV/互动统计；无新增遥测。

## Alternatives and trade-offs

| Option | Benefit | Cost/risk | Disposition |
|---|---|---|---|
| 独立 Product 模型 | 字段纯净 | 后台/前台/SEO/多语言全双轨 | 否决（G1 已拍板复用 Content） |
| 收藏 DELETE API | REST 语义纯正 | 与现有 toggleLike 交互范式不一致 | 否决，POST 切换 |
| 邮件模板引擎（handlebars/ejs） | 模板与代码分离 | 新增生产依赖、类型安全弱 | 否决，纯 TS 模板函数（零生产依赖） |
| 页面 HTML 断言用 renderToStaticMarkup | 无需起服务 | next-intl/App Router 上下文 mock 复杂脆弱 | 否决，dev server fetch（TEST-019） |
| vitest 替代 jest | ESM/TSX/Next 生态亲和 | 团队新工具 | 采纳（dev-only，G1 已披露） |

## Migration and rollback

- Migration/preconditions：执行 `prisma migrate dev` 前先做一键备份（现有 backup 能力）；迁移仅含加列（可空/默认值）与建表；
- 验证顺序：迁移文件生成 → 临时库依序 apply baseline_init → form_submission_status → 本迁移 + 代表性数据断言（TEST-017）→ 应用启动冒烟；
- Rollback or compensation：人工回滚 SQL 脚本（`DROP TABLE Favorite; ALTER TABLE Content DROP COLUMN gallery/specs/favoriteCount; ALTER TABLE User DROP COLUMN ...`，注明需 SQLite ≥ 3.35，否则按建表复制法）；代码按 commit 粒度 revert；
- Irreversible effects: none（不删除/不修改任何既有列与数据）。

## Verification and residual risk

- Test layers：unit（模板/JSON-LD/分流函数）→ integration（服务层真库、迁移演练、HTML fetch）→ manual（后台 UI/邮件客户端/禁 JS 走查）；
- Security verification：隐私白名单（TEST-013）、登录墙（TEST-008）、邮件转义（安全评审专项）、admin API 会话保护回归；
- Residual risks and owners：GEO 实际收录效果不可自动化保证（接受，运营侧观察）；邮件客户端渲染差异（TEST-M-006 走查兜底）；owner: 用户/运营。
