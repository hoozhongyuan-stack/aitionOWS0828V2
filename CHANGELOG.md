# Changelog

## 3.1.0 (2026-09-03)

V3.1:规格表英文化 + 分享卡片 OG + 看板时间段趋势(spec-tdd-sdlc 流程交付)

功能:
- 商品规格表多语言:ContentTranslation.specs 列(一次纯增量迁移+中文副本回填,回滚 SQL 随迁);详情页兜底链(翻译→主表);后台编辑器规格参数移入语言 Tab(全量往返,顶层 specs=兜底列);上线后为 7 个演示商品补英文规格
- 分享 OG 卡片:根布局 metadataBase;buildOpenGraph 公共助手(图片兜底链 封面→LOGO→省略,全绝对 URL);首页/栏目页/联系页补齐 openGraph;文章/商品详情统一绝对化
- 看板时间段趋势:GET /api/admin/dashboard?from=&to=(成对/ISO/日历差≤92/仅 path=* 口径/YYYY-MM-DD/未来日补 0,非法 400,无参兼容);后台近 7/30/90 天预设+自定义起止

质量:
- 新增测试 TEST-101/102/201~205 + og/track 单测:27 文件 156 测试;覆盖率(新增模块清单口径)96.48/89.43/100/97.92(阈值 90/85/90/90)
- 测试基建:dev-server 集成测试构建目录隔离(NEXT_TEST_DIST_DIR),修复并发互扰


## 3.0.0 (2026-08-31)

V3.0:商品展示 + 收藏与个人中心 + 用户资料扩展 + 邮件模板升级(spec-tdd-sdlc 流程交付,G3 候选 2379533)

功能:
- 商品展示(复用 Content 体系,moduleType=product):后台图集/规格参数编辑、/product/[slug] SSR 详情页(图集/参数表/询盘表单/Product JSON-LD/TDK)、栏目页二级分类导航、llms.txt 产品分区、sitemap 收录、演示种子
- 商品询盘:详情页关联启用表单即渲染询盘(复用表单获客链路:防重/限频/结构化通知)
- 收藏:POST /api/interaction/favorite(登录切换、401/404 语义、事务计数同步、唯一约束兜底);文章/商品详情收藏按钮(未登录跳登录回跳);个人中心 /account(我的收藏/我的投稿/退出);页头入口;/submissions 3xx 兼容跳转
- 用户资料:公司名称/国家/省/市仅后台维护(编辑弹窗+公司名搜索);前台全出口 toPublicUser 白名单隔离(隐私边界测试锁定)
- 邮件模板:品牌 HTML 模板层(品牌头/结构化区块/CTA/页脚,全内联样式,主题色注入);密码重置(zh/en)、表单提交(含来源页/IP)、投稿待审三类接入;静默失败语义不变

质量:
- 测试基建从零到一:vitest + @vitest/coverage-v8(dev-only),19 文件 110 测试;新增模块覆盖率 96.47/97.93/100/85.48(阈值 90/90/90/85)
- 一次纯增量迁移 20260830120000(Content gallery/specs/favoriteCount、User 资料 4 列、Favorite 表),存量数据零损失;回滚脚本 prisma/rollback-v3.sql
- 独立三方评审(代码/安全/QA)18 项发现全部修复并复核通过;GUI 前后台走查 15 项(含 BUG-1 首页卡片分流修复)


## 2.2.0 (2026-08-28)

修复:
- 爬虫点路径(如 /favicon.ico)跳过中间件后 locale 被解析为文件名,传入 Intl API 抛 RangeError → [locale] 布局校验 + safeDateLocale 集中兜底(生产已验证错误归零)

功能:
- 表单提交数据处理流:未处理/已处理状态标记与筛选、处理时间戳、列表未处理数徽标、数据入口文字化、CSV 增加处理状态列(含增量迁移 20260828010000)

## 2.1.0 (2026-08-28)

GEO 强化(生成式引擎优化):
- 动态页(文章/栏目/协议)补齐 canonical + hreflang(含 x-default);固定页补 x-default
- 登录/注册/工具页与后台全部页面 noindex(防薄内容收录)
- 新增 /llms.txt:面向 AI 爬虫的站点导览(站点信息/栏目/文章清单,与后台内容同步)
- robots.txt 增加主流 AI 爬虫分组(GPTBot/PerplexityBot/ClaudeBot 等 9 项),后台可一键允许/禁止
- 修复:robots.txt 与 sitemap.xml 原为构建期静态化,后台收录开关与内容发布不实时生效 → force-dynamic

界面:
- 后台登录页:科幻粒子背景(纯 Canvas 零依赖,尊重系统减弱动效)、系统名称与客服邮箱标识
- 页脚重构:品牌标识独立置顶;模块行按 用户协议 → 联系我们 → 社交名片 排列;社交名片右对齐

## 2.0.0 (2026-08-27)

安全加固(首轮审计七项):
- 前台上传接口限流(游客 12 次/10 分钟);X-Forwarded-For 改为右起可信跳解析(TRUSTED_PROXY_HOPS)
- 生产环境 AUTH_SECRET 缺失/为默认值时拒绝发放会话(fail-closed)
- nodemailer 升级至 9.x(消除 7 项高危);邮件头 CRLF 净化;SMTP 显式超时
- 封禁用户即时失效:评论/点赞/投稿/上传统一复查账号状态
- 主题配置写入白名单 + 输出侧净化(消除 <style> 逃逸面)
- 全站基线安全头(nosniff / X-Frame-Options / Referrer-Policy / Permissions-Policy / HSTS)

功能与修复:
- 新增:文章编辑器可挂载"所属表单",详情页底部渲染;新增表单提交数据页(分页/删除/CSV 导出)
- 修复:轮播外链两处点击拦截;表单数据页 404;视频上传假成功提示;上传前 Content-Length 预检
- 修复:CSV 导出公式注入;页脚重构(社交二维码常驻 108×108、三列垂直齐平、隐私政策文案与右对齐)
- 视频上传单独放宽至 400MB(其余类型仍按后台配置)
- 后台 17 个页面宽度统一(max-w-6xl 居中)
- 页头按账号实时状态渲染(禁用即刻游客态)

工程:
- 铁律对齐:页面/接口层直连 Prisma 清零(agreement/user/admin 服务层收编)
- 基线迁移:初始化 prisma/migrations 并标记已应用,后续升级走 migrate deploy
- 依赖:npm audit 归零(prisma 锁定 6.12.0)
- 验收脚本修复(凭据环境变量/维护模式 finally/断言适配存量数据/限频自节奏)并全量通过(25/25)
- 种子补齐验收夹具(welcome-aition / news / contact-form / 双语协议)

> 升级注意:2.0.0 起生产环境必须配置强随机 AUTH_SECRET(否则登录接口返回 503);
> 数据库升级走 `prisma migrate deploy`(已建基线,数据无损)。
