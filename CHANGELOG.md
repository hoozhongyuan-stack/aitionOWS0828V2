# Changelog

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
