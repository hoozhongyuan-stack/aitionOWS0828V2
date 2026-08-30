---
spec_id: "SPEC-v3-catalog-favorite-mail"
spec_version: 5
status: draft
risk_class: "high-risk"
g2_required: "yes"
---

# V3.0：商品展示 + 收藏与个人中心 + 用户资料扩展 + 邮件模板升级

## User-visible summary

企业客户需要在官网展示商品（仅展示、不交易），商品支持两级分类浏览、图集与规格参数展示、询盘表单获客，并对 GEO（AI 搜索引擎）友好；注册用户可以收藏文章与商品并在个人中心统一查看；后台可为用户维护公司名称与国家/省/市资料（前台不可见）；系统发出的邮件（密码重置、管理员通知）升级为品牌化、结构化的 HTML 模板。

受益方：企业客户（商品展示与获客）、注册用户（收藏与个人中心）、站点管理员（用户资料维护、高效的通知邮件）。

## Scope

### Included

- 商品 = `moduleType=product` 栏目下的 Content（复用现有内容体系），扩展图集与规格参数；后台内容编辑支持维护；前台商品专属列表与详情模板；二级分类浏览；询盘表单联动；Product JSON-LD / llms.txt / sitemap 收录。
- 登录用户对任意已发布内容（文章/商品）的收藏切换；详情页收藏按钮；个人中心 `/account`（我的收藏、我的投稿、退出登录）及页头用户菜单入口；`/submissions` 兼容跳转。
- `User` 新增公司名称/国家/省/市 4 个可空字段，仅后台可编辑；后台用户列表支持按公司名称模糊搜索；`Content.favoriteCount` 冗余计数，后台**只读展示**（与 viewCount/likeCount/shareCount 现状对称——互动计数自 V1.2 起为只读，不提供修改/清零写入口）。
- 统一品牌 HTML 邮件模板层；密码重置邮件（多语言）与管理员通知邮件（结构化）接入。
- 测试基建前置建设（见 REQ-013）：vitest + 覆盖率工具 + 独立测试数据库策略，作为一切行为 TDD 的前置。
- 可选种子（仅新装环境生效，幂等、不覆盖客户配置）：预置「产品中心」演示栏目树。non-normative：不设独立 REQ/AC，作为交付便利项随 G2 文件清单交付，缺失不阻塞验收。
- `Content.favoriteCount` 的后台只读展示随 REQ-001 同页实现（内容编辑页互动统计区，与 viewCount/likeCount/shareCount 同一展示区，遵循互动计数只读现状），在 G2 实施计划文件清单中固化。

### Not included

- 购买、下单、价格、购物车、库存等任何交易能力。
- 微信分享卡片（JS-SDK）——用户已决策舍弃。
- 公司/地区字段的前台展示与用户自助编辑。
- gallery/specs 的多语言翻译（存主表，跨语言通用）。
- 国家/省市的标准化地区数据字典（自由文本）。
- 商品列表卡片上的收藏按钮（收藏入口仅详情页与个人中心）。

## Terminology

| 术语 | 定义 |
| --- | --- |
| GEO | 生成式引擎优化（Generative Engine Optimization）：面向 AI 搜索/问答引擎的内容可检索性 |
| TDK | Title / Keywords / Description（单页 SEO 元信息） |
| moduleType | 栏目模块类型（`Category.moduleType`：news/product/case/article…），决定前台模板与详情路由 |
| 收藏切换 | 对同一（targetType,targetId,userId）重复调用产生确定的状态翻转；数据库唯一约束兜底，不产生重复记录 |
| 询盘表单 | 商品详情页底部渲染的关联 Form（`Content.formId`），用于「咨询/获取报价」获客 |

## Context and constraints

- Existing behavior：商品当前等价于普通文章（单封面 + 富文本，详情走 `/article/[slug]`，列表用通用 `ContentCard`）；无收藏模型、无个人中心（仅有独立 `/submissions` 页）；`User` 无资料字段，后台仅支持禁用/启用；邮件为纯文本行拼接（`src/server/notify/index.ts`）；项目无自动化测试框架（无 vitest/jest、无 test script）。
- Repository evidence：`prisma/schema.prisma`（Category.parentId 树形、Content.formId、Like 表范式）、`src/server/ugc/index.ts`（toggleLike/hasLiked 范式）、`src/server/content/index.ts:288`（listForLlms 已含全部已发布内容）、`src/app/llms.txt/route.ts`、`src/components/site/content-card.tsx:26`（详情链接固定 article）、`src/server/user/password-reset.ts`（重置流程携带请求 locale）、`prisma/migrations/`（baseline_init、form_submission_status）。
- Constraints：SQLite + Prisma；页面/接口不得直连 Prisma（必须经 `src/server/**`）；工程铁律见 README（UGC 默认待审、零硬编码配置、本地存储）。
- Assumptions：存量数据库为 2.x 系列 schema；`NEXT_PUBLIC_SITE_URL` 用于生成绝对 URL；邮件 SMTP 配置沿用现有「功能设置 → 邮件通知」。

## Requirements

| ID | Status | Normative behavior | Rationale |
| --- | --- | --- | --- |
| REQ-013 | active | 在任何行为 RED 之前，系统仓库必须具备可运行的测试基建：vitest 与 @vitest/coverage-v8（仅 devDependencies）、`npm test` / `npx vitest run` 可执行、`@/` 路径别名解析、独立测试数据库策略（每次测试运行创建临时 SQLite 库 → 依次应用全部既有迁移 → 注入 fixture → 测试后清理）。基建必须先通过冒烟测试，其后行为测试的 RED 才有效。 | 仓库零测试基建；否则行为 RED 将因基建而非行为失败 |
| REQ-001 | active | 系统必须允许后台为 product 类型栏目的内容维护图集（gallery，多图有序数组）与规格参数（specs，键值对有序数组），并随内容一起保存与回显。 | 商品信息承载的核心缺口 |
| REQ-002 | active | 系统必须在 `/[locale]/product/[slug]` 提供 SSR 商品详情页：渲染图集、规格参数表、富文本正文；内容关联了启用中的表单（formId 且表单 enabled）时渲染询盘表单（article 详情沿用现状：渲染关联表单不校验 enabled——该差异为有意行为）；单页 TDK 沿用 ContentTranslation；article 类型内容的详情路由与渲染必须保持不变。 | 商品详情与询盘获客；保护存量文章行为 |
| REQ-003 | active | 系统必须在 product 栏目（含其子栏目）的栏目页渲染商品专属列表：图卡网格（封面或图集首图）、父栏目页展示子分类页签、子栏目页展示父分类返回链接与兄弟分类导航、保留分页；非 product 栏目列表渲染必须保持不变。 | 二级分类浏览是本需求的显式目标 |
| REQ-004 | active | 系统必须为商品详情页输出 Product JSON-LD（name/image 绝对 URL/description/brand/category，specs 含「型号」类键值时含 sku），并将商品纳入 llms.txt（独立产品分区）与 sitemap。 | GEO 友好是显式目标 |
| REQ-005 | active | 系统必须为登录用户提供对任意已发布内容的收藏切换接口（POST 一次调用 = 一次状态翻转，返回当前收藏态与最新计数；数据库唯一约束兜底不产生重复记录），同步维护 favoriteCount，并提供个人收藏列表查询（含内容类型标识）；未登录调用必须返回 401，对不存在或未发布内容的调用必须返回 404。 | 收藏核心域 |
| REQ-006 | active | 文章与商品详情页必须展示收藏按钮及收藏状态；未登录用户点击时必须跳转登录页并在登录后返回原详情页。 | 前台入口与登录墙 |
| REQ-007 | active | 系统必须在 `/[locale]/account` 提供登录态个人中心：我的收藏（区分文章/商品类型、可取消收藏）、我的投稿（含审核状态）、退出登录；页头用户菜单必须包含登录态可见的「个人中心」入口；未登录访问必须跳转登录页。 | 收藏的查看端 |
| REQ-008 | active | 访问 `/[locale]/submissions` 必须以 3xx 重定向到个人中心投稿视图（`/account?tab=submissions`），保证既有入口不失效。 | 兼容既有链接 |
| REQ-009 | active | 后台用户管理必须支持编辑用户的公司名称、国家、省、市（全部非必填、自由文本），并在用户列表支持按公司名称模糊搜索。 | 需求 2 的核心行为 |
| REQ-010 | active | 系统发出的所有邮件必须使用统一品牌 HTML 模板：品牌头部（LOGO+站点名）、结构化正文（段落/键值表格/高亮块）、CTA 按钮、页脚（版权/备案）；样式必须全部内联，不依赖外部 CSS；主题色取后台主题配置。 | 需求 3 的核心行为 |
| REQ-011 | active | 密码重置邮件必须使用品牌模板，按重置请求的界面语言（zh/en，缺省用站点默认语言）输出文案，包含可点击的重置链接（绝对 URL）与有效期提示。 | 面向用户的邮件需本地化 |
| REQ-012 | active | 管理员通知邮件（表单提交、投稿/评论待审）必须使用品牌模板并结构化呈现：表单名、字段键值表格、来源页、IP 与时间；附「去后台处理」CTA。 | 让通知邮件真正可用 |
| NFR-001 | active | 系统必须保证公司名称/国家/省/市字段不出现在任何前台 API 响应（含 /api/auth/me、登录/注册响应）中。 | 隐私边界（用户已拍板：前台完全不可见） |
| NFR-002 | active | 商品列表页与商品详情页必须为服务端渲染：禁用 JavaScript 时初始 HTML 中可见核心内容（列表：商品名与图片；详情：商品名、图、参数表、正文）。 | GEO 友好的前提 |
| NFR-003 | active | 数据库变更必须在一次迁移内完成且对存量数据无损：全部新增列可空或带默认值，不修改/删除既有列，迁移可重复执行（prisma migrate deploy）。 | 存量客户升级安全 |
| NFR-004 | active | SMTP 未配置或发送失败时，邮件必须静默跳过且不阻断业务流程（表单提交、注册、投稿行为不受影响），sendMail 返回 false 语义保持。 | 现有可靠性约束不得回退 |
| NFR-005 | active | 本次新增行为必须落在与存量代码可分离测量的新模块中；以 @vitest/coverage-v8 对 G2 计划固化的**新增模块清单**计算覆盖率：statements/lines/functions ≥ 90%、branches ≥ 85%；登录墙与隐私字段过滤分支必须有断言；存量文件内的扩展行为由 TEST-001..019 行为测试锁定（不纳入百分比口径——新增函数与存量代码同文件时，文件级覆盖率无法将新增代码分离测量，QA 实测该口径不可满足且无意义）。 | brownfield 质量门禁（阈值不变，口径修正为可测量且有意义） |
| NFR-006 | active | 栏目/列表接口返回的条目不得包含 gallery/specs 内容（查询投影排除），详情页才读取。 | 防止列表性能退化 |

## Acceptance criteria

| ID | Requirement links | Observable acceptance | Verification links |
| --- | --- | --- | --- |
| AC-017 | REQ-013 | Given 全新克隆的仓库，when 执行 `npm install && npx vitest run`，then 冒烟测试可被发现并执行成功（exit 0）；when 行为测试在实现前运行，then 失败原因是断言失败（missing_behavior）而非配置/发现错误。 | TEST-000 |
| AC-001 | REQ-001 | Given 管理员编辑 product 栏目内容并上传 3 张图、录入 2 行参数，when 保存后重新打开，then 图集顺序与参数键值完整回显；Given article 栏目内容编辑页，when 打开，then 不出现图集/参数编辑区。 | TEST-001, TEST-M-001 |
| AC-002 | REQ-002 | Given 已发布商品含 gallery/specs/关联启用表单，when 服务层组装商品详情数据，then 返回图集（封面兜底首位）、参数键值对、正文与询盘表单数据；Given 商品无关联表单或表单已禁用，then 表单数据为空。 | TEST-002, TEST-003 |
| AC-020 | REQ-002 | Given 运行中的站点与已发布商品，when 请求 /product/[slug] 的初始 HTML，then 响应包含图集 img、参数表格、富文本正文与询盘表单（启用时）标记；when 用禁用 JavaScript 的浏览器访问，then 页面呈现同样内容。 | TEST-019, TEST-M-007 |
| AC-003 | REQ-002 | Given article 类型内容，when 访问其详情，then 仍由 /article/[slug] 渲染且行为与基线一致（列表卡片链接按类型分流）。 | TEST-004 |
| AC-004 | REQ-003 | Given 父商品栏目含 2 个已发布子栏目，when 访问父栏目页，then 渲染子分类页签且点击后仅显示该子栏目商品；Given 子栏目页，when 访问，then 显示父分类链接与兄弟分类导航；Given 非 product 栏目，when 访问，then 列表与基线一致。 | TEST-005, TEST-M-002 |
| AC-005 | REQ-004 | Given 已发布商品，when 查看详情 HTML 源码，then 含可解析的 Product JSON-LD（name、image 绝对 URL、description；specs 含型号时含 sku）；when 请求 /llms.txt，then 商品出现在独立产品分区；when 请求 /sitemap.xml，then 包含该商品详情 URL。 | TEST-006, TEST-007 |
| AC-006 | REQ-005 | Given 登录用户对未收藏内容调用一次收藏切换接口，then 变为已收藏且 favoriteCount +1；再调用一次，then 变为未收藏且 favoriteCount -1；连续快速调用不产生重复记录。 | TEST-008 |
| AC-007 | REQ-006 | Given 已登录用户在详情页，when 点击收藏按钮，then 状态即时切换；Given 未登录用户点击，when 完成登录，then 返回原详情页且收藏状态正确。 | TEST-009, TEST-M-003 |
| AC-008 | REQ-007 | Given 登录用户收藏了 1 篇文章与 1 个商品，when 访问 /account，then 收藏列表展示 2 条且带类型标识，取消收藏后列表与计数同步减少；页头用户菜单含「个人中心」入口；未登录访问跳转登录页。 | TEST-010, TEST-M-004 |
| AC-009 | REQ-008 | Given 用户访问旧链接 /submissions，when 页面响应，then 3xx 重定向到 /account?tab=submissions 且该视图展示其投稿与审核状态。 | TEST-011 |
| AC-010 | REQ-009 | Given 后台编辑用户资料填入公司名称/国家/省/市，when 保存并重新打开，then 4 字段正确回显且均可留空；Given 列表搜索框输入公司名关键字，then 仅返回匹配用户。 | TEST-012, TEST-M-005 |
| AC-011 | NFR-001 | Given 完成了资料维护的用户，when 调用 /api/auth/me、登录、注册接口，then 响应 JSON 不含 companyName/country/province/city 键。 | TEST-013 |
| AC-021 | REQ-005, NFR-004 | Given 未登录调用收藏切换接口，then 返回 401 且 favoriteCount 不变；Given 收藏目标是不存在或未发布的内容，when 调用收藏接口，then 返回 404 且计数不变；Given 服务层读到非法 gallery/specs JSON，then 按空图集/空参数表返回且不抛错；Given SMTP 未配置或发送时抛错，then sendMail 返回 false 且调用方业务流程成功。 | TEST-008, TEST-002, TEST-014 |
| AC-012 | REQ-010, NFR-004 | Given 已配置品牌与主题色，when 生成任意一封模板邮件，then HTML 含品牌名与 LOGO 绝对 URL、全部样式内联（无 <link>/外部 stylesheet）、主题色已注入、含页脚版权。 | TEST-014 |
| AC-013 | REQ-011 | Given 重置请求语言为 en，when 生成密码重置邮件，then 邮件为英文文案、含绝对重置链接与有效期提示；zh 请求获得中文版本。 | TEST-015 |
| AC-014 | REQ-012 | Given 游客提交了含 3 个字段的表单，when 管理员通知邮件生成，then 正文含表单名、3 个字段键值、来源页、IP 与时间及后台处理 CTA。 | TEST-016 |
| AC-015 | NFR-003 | Given 对临时库依次应用 baseline_init、form_submission_status 两个既有迁移并植入代表性数据（用户/文章/互动），when 应用本次迁移，then 全部既有数据保留、新列取空值/默认值，且迁移可重复执行。 | TEST-017 |
| AC-016 | NFR-006 | Given 商品栏目列表数据返回，when 检查条目，then 不包含 gallery/specs 键。 | TEST-018 |
| AC-018 | NFR-002 | Given 商品列表页与详情页 HTML 响应，when 检查初始 HTML（不执行 JS），then 列表含商品名与图片、详情含商品名/图/参数表/正文。 | TEST-005 扩展断言 + TEST-M-007 |
| AC-019 | NFR-005 | Given G2 计划固化的新增/修改文件清单，when 运行覆盖率采集，then statements/lines/functions ≥ 90%、branches ≥ 85%，且登录墙（TEST-008）与隐私过滤（TEST-013）断言通过。 | coverage-manifest（G3 门禁） |

## TDD and verification plan

前置声明：TEST-000（基建冒烟）必须先于所有行为 TEST 达成 GREEN；其后各行为测试先记录 RED（失败原因为 missing_behavior），再实现最小 GREEN。集成测试数据库策略：测试运行创建临时 SQLite 文件库 → `prisma migrate deploy` 应用全部既有迁移（含本次新迁移）→ fixture 注入 → 运行 → 删除；测试间互不共享库文件。

| Test ID | AC links | Layer | Expected RED | GREEN evidence target |
| --- | --- | --- | --- | --- |
| TEST-000 | AC-017 | infra | 不适用（基建验收：冒烟测试存在且通过；基建 GREEN 是行为 RED 的前置条件） | `npx vitest run tests/smoke.test.ts` |
| TEST-001 | AC-001 | integration | content 服务保存/读取 product 内容时 gallery/specs 断言失败（字段缺失/未持久化） | `npx vitest run tests/server/content-product.test.ts` |
| TEST-002 | AC-002, AC-021 | integration | 商品详情数据组装缺 gallery/specs/关联表单、非法 JSON 未按空容错时断言失败 | `npx vitest run tests/server/product-detail.test.ts` |
| TEST-003 | AC-002 | integration | 询盘表单区块数据（formId→启用表单校验）缺失或不过滤 enabled 时断言失败 | `npx vitest run tests/server/product-detail.test.ts` |
| TEST-004 | AC-003 | unit | 按栏目类型分流详情链接的函数对 article 返回 /article/ 断言失败 | `npx vitest run tests/server/content-type.test.ts` |
| TEST-005 | AC-004, AC-016, AC-018 | integration | 商品列表未按父/子栏目过滤、条目含 gallery/specs 键时断言失败 | `npx vitest run tests/server/product-list.test.ts` |
| TEST-006 | AC-005 | unit | ProductJsonLd 数据缺 name/image 绝对 URL/sku 规则时断言失败 | `npx vitest run tests/seo/product-jsonld.test.ts` |
| TEST-007 | AC-005 | integration | llms.txt/sitemap 数据源缺商品分区/URL 时断言失败 | `npx vitest run tests/server/llms-sitemap.test.ts` |
| TEST-008 | AC-006, AC-021 | integration | 收藏切换未登录未返回 401、计数不同步、404 场景缺失、重复记录时断言失败 | `npx vitest run tests/server/favorite.test.ts` |
| TEST-009 | AC-007 | unit | 收藏状态判断/回跳参数构造缺失时断言失败 | `npx vitest run tests/server/favorite.test.ts` |
| TEST-010 | AC-008 | integration | listMyFavorites 缺类型标识/取消不同步时断言失败 | `npx vitest run tests/server/favorite.test.ts` |
| TEST-011 | AC-009 | integration | /submissions 未重定向到 /account?tab=submissions 断言失败 | `npx vitest run tests/app/submissions-redirect.test.ts` |
| TEST-012 | AC-010 | integration | admin 用户资料更新未持久化 4 字段/搜索不匹配时断言失败 | `npx vitest run tests/server/user-profile.test.ts` |
| TEST-013 | AC-011, AC-019 | integration | 前台用户响应含 4 个隐私字段时断言失败（对响应对象断言键不存在） | `npx vitest run tests/server/user-privacy.test.ts` |
| TEST-014 | AC-012, AC-021 | unit | 模板 HTML 缺品牌头/内联样式/页脚/主题色、SMTP 失败未返回 false 时断言失败 | `npx vitest run tests/notify/mail-template.test.ts` |
| TEST-015 | AC-013 | unit | en/zh 密码重置邮件文案或链接错误时断言失败 | `npx vitest run tests/notify/mail-template.test.ts` |
| TEST-016 | AC-014 | unit | 表单通知缺字段表格/IP/时间时断言失败 | `npx vitest run tests/notify/mail-template.test.ts` |
| TEST-017 | AC-015 | integration | 迁移后存量行丢失/新列非空/重复执行失败时断言失败 | `npx vitest run tests/db/migration.test.ts` |
| TEST-018 | AC-016 | integration | 列表返回条目含 gallery/specs 键时断言失败 | `npx vitest run tests/server/product-list.test.ts` |
| TEST-019 | AC-020 | integration | 商品详情页路由不存在或初始 HTML 缺图集/参数表/表单标记时断言失败（404 或内容缺失） | `npx vitest run tests/app/product-page.test.ts` |
| TEST-M-001 | AC-001 | manual | 后台内容编辑 UI 走查（图集排序、参数行增删） | 后台操作截图 + 走查记录 |
| TEST-M-002 | AC-004 | manual | 商品列表页签/筛选/分页视觉走查 | 前台截图 + 走查记录 |
| TEST-M-003 | AC-007 | manual | 登录→收藏→回跳浏览器流程走查 | 前台截图 + 走查记录 |
| TEST-M-004 | AC-008 | manual | 个人中心三视图（含页头入口）视觉走查 | 前台截图 + 走查记录 |
| TEST-M-005 | AC-010 | manual | 后台用户编辑弹窗走查 | 后台截图 + 走查记录 |
| TEST-M-006 | AC-012/13/14 | manual | 三类邮件在 Gmail/QQ/Outlook 网页版排版走查 | 邮件渲染截图（本地 SMTP 捕获） |
| TEST-M-007 | AC-020, AC-018 | manual | 商品列表页与详情页禁 JS 走查（列表：商品名与图；详情：图集/参数表/正文/询盘） | 禁用 JS 的浏览器截图 + 走查记录 |

Non-behavior verification：HTML 级断言（AC-018/AC-020）的自动化部分由 TEST-019（dev server fetch + 初始 HTML 内容断言）与 TEST-005（数据层）覆盖；禁用 JavaScript 的真实浏览器视觉走查由 TEST-M-007 承担；shadcn/ui 组件样式不作单元断言，由 TEST-M-* 覆盖。

## Contracts and failure behavior

- 数据契约（迁移，L2）：`Content + gallery(String?) + specs(String?) + favoriteCount(Int, default 0)`；`User + companyName/country/province/city(String?)`；新表 `Favorite(targetType default "CONTENT", targetId, userId, 唯一约束(targetType,targetId,userId), index(userId))`。gallery/specs 以 JSON 字符串存储，服务层出口解析并校验（解析失败按空处理，不抛 500）。
- API 契约：新增 `POST /api/interaction/favorite`（body: `{ contentId }`，登录态；返回 `{ favorited, favoriteCount }`；401 未登录 / 404 不存在或未发布）——切换语义与 toggleLike 范式对齐，不提供 DELETE；`/api/admin/users` 扩展资料编辑（4 字段）与公司名称搜索参数；现有接口（form/comment/interaction/auth）请求与响应结构不变；前台用户相关响应维持既有字段集（不得新增 4 个隐私字段）。
- 失败行为：收藏不存在/未发布内容 → 404 且计数不变；邮件模板渲染异常或 SMTP 失败不得阻断业务（静默记录日志，sendMail 返回 false）；gallery/specs JSON 非法 → 前台按空图集/空参数表渲染。
- 兼容性：`/article/[slug]`、评论、点赞、转发、表单、投稿、后台备份行为不变；`/submissions` 3xx 至 `/account?tab=submissions`；article 与 product 详情对「已禁用关联表单」的处理差异（article 沿用现状不校验 enabled、product 仅渲染 enabled）为有意行为，已在 REQ-002 声明；登录/注册响应经 toPublicUser 白名单统一为 id/email/nickname/avatarUrl（较基线 {id,nickname} 为加法扩展，design.md 已批准，TEST-013 逐键锁定）。

## Design approval triggers

| Trigger | Applies | Evidence or decision |
| --- | --- | --- |
| Public contract or compatibility change | yes | 新增 /product/[slug] 路由与 favorite API；/submissions 重定向 |
| Schema/data migration | yes | Content/User 加列 + 新表 Favorite（一次迁移） |
| Auth, sensitive data, or security control | yes | 收藏登录墙；用户资料隐私边界 |
| Production dependency, paid service, or external effect | yes | 新增开发依赖 vitest/@vitest/coverage-v8（dev-only，不进生产依赖）；邮件为对外发送内容 |
| Destructive, difficult-to-recover, or major architectural choice | no | 迁移均为可空加列/新表 |

G2 decision: required（High-risk 类 + 迁移/隐私/公共契约触发）。

## High-risk controls

- 威胁/失败分析：① 迁移风险——全部为加列/新表，SQLite `ALTER TABLE ADD COLUMN` 安全，迁移前执行一键备份（项目已有备份能力）；② 隐私风险——4 字段建立「仅 admin API 出口」白名单，服务层提供前台用户序列化函数统一过滤，TEST-013 锁死；③ 收藏防刷——仅登录用户、唯一约束兜底，计数在事务内更新；④ 邮件注入——沿用 headerSafe，模板输出对用户可控字段做 HTML 转义。
- 迁移顺序：备份 → prisma migrate dev 生成迁移 → 对按既有迁移序列重建的临时库执行 migrate deploy 验证（TEST-017）→ 应用启动冒烟。
- 回滚：交付人工回滚 SQL 脚本（drop 本次新增列/表；Prisma migrate 无内建 down）；代码按 git revert 粒度回退；不删除任何既有列/数据。
- 可观测性：邮件发送沿用 console 日志；收藏/询盘计入现有互动统计。
- 数据处理：用户资料字段仅后台读写；邮件内容不落库（沿用现状）。
- 残余风险：无 JS-SDK 的微信内分享样式不受控（已接受，需求舍弃）；Product JSON-LD 无 offers 的搜索引擎警告（已接受，展示型站点）。
- 决策归属：用户（G1/G2/G3 批准）；迁移与隐私设计细节在 G2 呈现。

## Open decisions

| Decision | Options and trade-offs | Owner | Blocks |
| --- | --- | --- | --- |
| 无未决业务决策 | 五项业务决策已在需求阶段由用户拍板（见 docs/V3.0升级计划.md 第〇节）；实现细节（测试基建选型、API 形态等）由 G2 设计呈现 | user | none |

## Traceability status

- All MUST REQ/NFR items have AC links: yes（REQ-013→AC-017；NFR-002→AC-018；NFR-005→AC-019；NFR-004→AC-021/AC-012）
- All ACs have TEST or justified verification links: yes（HTML 级验证由 TEST-M-007 手工走查，理由已在 Non-behavior verification 声明）
- Independent Spec review: changes_requested（v1）→ ready_for_g1（v2 复核）→ v3/v4 按复核遗留建议收口（401 直接 AC、TEST-M-007 扩范围、seed 标注 non-normative、AC-020 增自动化 HTML 断言 TEST-019），均系评审者指出的方向
- Unresolved Critical/High findings: 0（v1 评审的 3 项 High 已在本版处置）

## Version history

| Version | Change summary | Prior approval invalidated |
| --- | --- | --- |
| 1 | Initial draft（依据 docs/V3.0升级计划.md 与代码库核实结果起草） | not_applicable |
| 2 | 按独立评审处置 17 项发现：新增 REQ-013/AC-017/AC-018/AC-019/AC-020/AC-021/TEST-000/TEST-M-007；修正 toggle 语义与 API 契约、REQ-011 locale 依据、AC-009 去实现编码、NFR-005 口径定义、TEST-017 fixture 策略、迁移回滚措辞；补术语表、favoriteCount 后台维护与可选 seed 入范围、article/product 表单 enabled 差异声明 | 无（v1 从未获批） |
| 3 | 按复核遗留建议收口：AC-021 补 401 直接断言；TEST-M-007 扩为列表+详情禁 JS 走查；可选 seed 标注 non-normative 并声明 favoriteCount 后台维护随 REQ-001 同页实现 | 无（v1/v2 从未获批） |
| 4 | AC-020 增加自动化 HTML 集成断言 TEST-019（dev server fetch 初始 HTML），消除 AC 仅手工验证的追溯缺口 | 无（v1~v3 从未获批） |
| 5 | favoriteCount 后台口径澄清为「只读展示」（与 V1.2 缺陷 8 修复后的互动计数只读现状对称；安全评审确认只读为更优方向，不引入特权写入口）；实现已按此口径交付，属措辞对齐。NFR-005 覆盖率口径修正为「新增模块清单」（QA 实测原口径不可测量：新增函数与存量代码同文件，文件级覆盖率无法分离新增代码）；新增行为拆分至独立模块落地。补登录/注册响应白名单扩展的兼容性声明 | v4 的 G1/G2 绑定（重批后以 v5 为基线） |
