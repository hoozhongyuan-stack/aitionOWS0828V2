# AitionOWS — 工程记忆(供 AI 助手每次会话自动读取)

企业官网模板系统:Next.js 15(App Router) + shadcn/ui + Prisma + SQLite + Docker 单容器。
当前版本与变更史见 `CHANGELOG.md`;部署操作见 `docs/部署说明.md`;涉密运维信息见 `LOCAL.md`(不入库)。

## 铁律(README 五条 + 演进补充)

1. 页面/接口**不得直连 Prisma**,一律经 `src/server/**` 服务层(app 层已零直连,保持住)
2. 展示型配置零硬编码,全部入库经缓存管线(后台"保存即生效")
3. UGC(评论/投稿)默认 **PENDING 先审后发**,任何路径无自动上线
4. 静态资源只走本地存储,无云 SDK
5. UI 只用 shadcn/ui + Tailwind;关键逻辑中文注释
6. robots.txt / sitemap.xml 是元数据路由,必须 `force-dynamic`(否则构建期静态化,后台开关不生效)
7. Intl/日期调用必须过 `safeDateLocale()`(lib/utils)——点路径会让 [locale] 解析出非法值
8. 数据库结构变更走增量迁移:手写 SQL 进 `prisma/migrations/<日期>_<名称>/migration.sql` → `migrate deploy`(生产 entrypoint 自动执行);禁用 `db push` 改生产

## 常用命令

```bash
npx tsc --noEmit && npm run lint && npm run build   # 门禁三件套,任何改动后必跑
npm run dev / npm run build && npm run start        # 本地开发/生产
node scripts/acceptance.mjs                          # 黑盒验收(25 项)
#   验收环境变量:BASE_URL(默认 localhost:3000)、ADMIN_USER/ADMIN_PASS
#   注意:会写数据;跑在副本库上(先 cp data/app.db data/acceptance-app.db 并 seed)
npm run prisma:deploy / prisma:generate              # 迁移/客户端
```

## 架构速记

- `src/server/**` 是唯一允许碰 Prisma 的层;API 是薄壳;页面组件禁查库
- 认证:自研 JWT(jose),admin/user 双 cookie(`aition_admin`/`aition_user`),`getActiveUserSession` 带 status 复查(写接口/页头必须用它,`getUserSession` 仅限纯展示兜底)
- 生产 compose:`docker/compose.prod.yml`(app + Caddy,80/443,数据库卷挂载);AUTH_SECRET 缺失或默认值 → 登录接口 503(fail-closed,是特性)
- 服务器 1.9G 内存,**swap 4G 已配置**(/swapfile),构建/运行依赖它,别删


## V4.1/V4.2/V4.3 交付记忆(2026-09-08,子账号审计/交易深化/第三主题)

- **权限体系(V4.1)**:AdminUser.role=OWNER/STAFF+permissions(JSON 权限组);守卫 requireOwner/requirePerm 在 lib/auth/session(**查库校验,禁用立即生效**——getAdminSession 只验 token 不查库,页面壳级鉴权用它,数据鉴权必须用守卫);权限组定义+canSeeMenu 在 server/admin/permissions.ts;**新增敏感 API 必须选对守卫**(OWNER:settings 全组/users/agreements/locales/seo-meta/ui-translations/backup/dashboard;组:contents 等六类=content、orders/products=commerce、ugc=moderation、geo-monitor=geo)
- 操作日志:logAdmin(server/admin)写 AdminLog,失败静默;写操作在 route 守卫后 void 埋点;admin-logs 页 OWNER 专属
- **售后(V4.2)**:OrderRefund 一单一次(unique orderId);审核通过=事务内双写(refund.APPROVED+order.REFUNDED/refundedAt)——**勿拆开写**(踩过:先写 refund 再 transitionOrder 非事务,转换失败导致状态不一致);金额≤实付服务端校验
- 商品管理=入口剥离(数据仍 Content(product 栏目)),listProductsAdmin;未来 SKU/库存再做物理剥表
- 媒体:MediaFolder 二级(parentId 仅 null 或一级 id,应用层禁第三级);非空禁删;素材选择器 MediaPicker 组件(media-picker.tsx)已接 UploadField 与富文本;上传 FormData.folderId 归档
- **第三主题 harvest(V4.3)**:globals.css [data-theme="harvest"] 段+主题页选择卡(推荐色板)+themeSchema 枚举+根 layout data-theme 挂载+aurora-motion 启用条件——**新增主题五处同步**;harvest 标题衬线+麦穗 h2::before(sway);classic/aurora 零改动
- 测试:tests/setup/db.ts 统一种子 AdminUser id=1 OWNER(守卫查库依赖);mock session 的测试文件需在 vi.mock 里补 requireOwner/requirePerm

## V4.0 交付记忆(2026-09-07,海外独立站起步:交易 MVP)

- **交易域架构**:商品交易字段在 Content(priceCents 整数分/currency/spu,null=仅询盘混合模式);Order/OrderItem **快照模式**(下单时服务端按现价重算,title/price/spu/coverUrl 全快照;contentId/userId 无外键,内容/用户删除订单信息保留)——**改价不改历史订单**
- 订单 5 态:PENDING→CONFIRMED→SHIPPED→COMPLETED,非终态可 CANCELLED;转换表在 server/order TRANSITIONS;每次流转异步发买家双语邮件(逐段中英对照),渲染/发送失败静默(NFR-004)
- 购物车纯客户端(localStorage,key=aition_cart_v1,cart-store.ts+useSyncExternalStore)——**结算服务端重算,前端数据不作计价依据**;游客下单 email 限频每小时 5 单
- 商店设置 Setting(group="shop" 平铺键:currency/paymentInfo/shippingFeeCents/freeShippingOverCents);运费 calcShipping 满额免邮优先
- 协议类型枚举:新增类型必须同步**agreementTypeSchema**(types/domain)——API 已改用 nativeEnum,但**协议前台展示页 TYPE_MAP(agreement/[type]/page)与后台下拉仍需手动加**(踩过:V4.0.2 COOKIES 加了前端漏了 API)
- 后台列表分页:统一 TablePagination 组件(10/50/100);四页(订单/内容/用户/审核两 Tab)已接入;新列表页直接复用
- 本地演示数据:demo 商品价格 $1299/$499+SPU;测试订单 id1-7;演示用户 v401demo@test.com(id=3)——生产库无这些数据
- 支付先决(用户侧):Stripe 大陆主体不可开户,需港/美/新主体;PayPal 大陆企业可注册——线下付款流即为此过渡

## V3.3 交付记忆(2026-09-07,首页楼层+全局 404+国内引擎白名单)

- **根布局重构(C1)**:html/head/主题注入自 [locale]/layout **上移至 src/app/layout.tsx**(新建;动态 lang 从 middleware x-geo-path 首段提取);[locale]/layout 剥壳为 NextIntlClientProvider 直通——**后续开发:全站 html 壳在根 layout,[locale]/layout 禁止再输出 html**;根级 not-found.tsx 承接全部 404(带点路径/段内未匹配),内联样式+后台错误页配置
- 首页楼层(D):存 Setting(group=layout,key=floors) **JSON 裸数组**(后台通用 settings API 整组保存);getHomeFloors 读取兼容裸数组/{floors:[]} 包装,逐条容错(非法跳过/style 回退/limit 收敛 1~12/上限 8/visible 过滤);**数据组装在服务层 getHomeFloorSections(locale)(铁律 1,页面不查库)**;已删栏目/无内容楼层渲染侧自然跳过;样式 grid3/list/feature,feature 复用 ContentCard featured
- GEO 白名单(C3):AI_BOTS 现含 18 引擎(新增 Kimi×3/ChatGLM-Spider/TongyiBot/PanguBot,UA 核实自 ai-robots.txt);**腾讯混元/元宝与百度无公开 AI 爬虫 UA,勿凭空添加**(Baiduspider 是传统搜索爬虫,计入污染 GEO 口径);geo-monitor stats API 附 knownBots,明细 Tab 引擎下拉选项自动跟随白名单
- 本地库 data/app.db 现存 3 层测试楼层配置(products=feature/product-news=grid3/news 隐藏)供验收;生产库无 floors 键=现状布局零变化;A(GEO 二期)/B(分享海报)暂缓,方案在 docs/V3.3升级计划.md

## V3.2 交付记忆(2026-09-06,布局预设+GEO 监测一期)

- 布局预设存 Setting(group=layout,key=home/category);缺省=现状布局,升级零变化;服务层 src/server/layout/index.ts
- GEO 监测:**AI 爬虫不执行 JS,客户端埋点抓不到**——记录点在 [locale]/layout(读 UA 匹配白名单异步写库);聚合+明细双写;后台「GEO 监测」页+明细 Tab+CSV 导出;180 天保留(cron 每月清理,脚本 scripts/geo-purge.sh)
- 编辑器规格参数已移入语言 Tab(V3.1 specs i18n);后台列表显示名统一按站点默认语言(zh-CN)取值(adminDisplayName/adminTitle helper)
- 微信扫码登录配置完成(开放平台业务域名校验文件 public/fejKunK1BB.txt;回调域 aition.art);H5(公众号)登录字段已预留未启用

## V3.1.1 交付记忆(2026-09-04,双主题包)

- `ThemeConfig.preset`(classic/aurora)存 Setting(theme);前台 `<html data-theme>` 挂载;**classic 路径零改动**(升级站点外观零变化已验证)
- 极光主题全部样式集中在 `src/styles/globals.css` 的 `[data-theme="aurora"]` 段;颜色仍走后台调色板变量,渐变端点为预置(--aurora-from/to),不做渐变编辑器
- 动效组件 `src/components/site/aurora-motion.tsx`(Parallax/Reveal):内部自检 data-theme 与 prefers-reduced-motion,非极光/减弱动效用户零行为差异;**不引入动画库**
- 富文本视频插入:Video 节点扩展 `src/components/admin/video-extension.ts`(schema 无 video 时 insertContent 静默丢弃——DEF-012)
- 主题覆盖建议走后台「主题外观→主题风格」选择卡;两套主题各自记忆推荐调色板

## V3.0 交付记忆(2026-08-31,spec-tdd-sdlc 流程)
- SSH/服务器凭据记忆统一看 `LOCAL.md`(gitignore,不入库);2026-09-04 起用 `ssh aition-prod` 别名(密钥 `~/.ssh/aition_tencent`,旧 aitionv2.pem 已丢失)
- **生产部署(2026-08-31)**:aition.art 已更新至 3.0.0(候选 2379533);部署前备份在服务器 `/opt/aition-ows/backups/pre-v3-20260831104530/`(data+uploads+package.json);V3 迁移与 2.2.0 迁移已在生产依序应用(Favorite 表已建);生产无商品演示数据属预期
- 生产「商品演示」栏目:一级+3 二级(3C 数码/运动服饰/工业设备)+7 个演示商品(iPhone 17 Pro/MacBook Pro M4/Mac Studio/鸿星尔克×2/宇树 G1/DENSO IKH20),导航第二位;全部标注演示·非销售;图片 4 张官方图+3 张品牌占位图


- 完整过程记录在 `.spec-tdd-sdlc/runs/run-20260830-v3-catalog-favorite-mail/`(Spec v5/G3 批准链 APR-006~011/32 份证据);候选 2379533
- 商品=Content(moduleType=product)而非独立表;前台详情路由按 `resolveContentDetailPath` 分流(/product/ vs /article/);**新增列表出口必须透传 moduleType**(BUG-1 教训:首页卡片漏传已修复)
- 收藏域在 `src/server/ugc/favorite.ts`;删除内容须事务内级联 `favorite.deleteMany`;收藏计数减法带 `gt:0` 护栏
- 前台用户序列化唯一出口 `toPublicUser`(server/user/profile.ts)——公司/国家/省/市 4 字段**严禁**出现在任何前台响应(TEST-013 锁定)
- 邮件模板层 `src/server/notify/template.ts`(纯 TS,零依赖);管理员通知用 `notifyAdmin(subject, lines, html?)` 三参形态,勿再复制本地 helper
- 测试:`npx vitest run`(19 文件 110 测试);覆盖率门禁 scope=vitest.config include 的**新增模块清单**(勿改回目录通配——存量文件会稀释口径);临时 SQLite 测试库由 tests/setup/db.ts 自动迁移
- `run.json`/`traceability.json` 的 canonical 哈希绑定 `updated_at` 等字段——**G3 批准后不可再写 run.json 非排除字段**(踩过:批准后写 g4_ledger 导致包漂移,G4 记录放 evidence/ 目录)
- route.ts 只准导出 HTTP method(Next 15.5 类型校验);helper 放 server 层

## 已知坑(真实踩过)

- Dockerfile 有 `ENTRYPOINT (npm run start)` → `docker compose run app <cmd>` 会变成启动服务器而不是执行命令;临时容器必须 `--entrypoint npx` 或 `docker run`
- SQLite 生产迁移前**必须先停 app 容器**(锁);迁移命令在服务器内 nohup 执行,SSH 长连接会被远端掐断
- 中间件 matcher 排除带点路径 → `/favicon.ico` 之类会以文件名落入 [locale] 段(已由布局校验 + safeDateLocale 兜底)
- 图片等富文本渲染前必须过 `sanitizeRichHtml`;CSV 导出必须过公式注入转义(见 server/form)

## 发布流程(版本号三段式)

1. `package.json` 版本 → `CHANGELOG.md` 顶部加条目
2. `git commit` + `git tag vX.Y.Z` + `git push origin main vX.Y.Z`
3. 桌面交付包:`git archive --format=tar.gz --prefix=AitionOWS_VX.Y.Z/ -o ~/Desktop/AitionOWS_VX.Y.Z.tar.gz vX.Y.Z`(天然排除运行时数据,交付前抽查内容)
4. 生产更新:scp 变更文件到 `/opt/aition-ows/` 对应路径 → 停 app → migrate deploy → `up -d --build` → 外网验证
