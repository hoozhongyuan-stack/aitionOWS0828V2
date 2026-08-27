# AitionOWS 企业官网模板系统

可售卖、可一键部署、高度自定义、AI 检索友好的通用企业官网模板。
后台全可视化配置,**保存即生效**,无需改代码、无需重启即可完成品牌、样式、内容、功能配置。

## 功能总览(需求书八大能力全量实现)

| 能力 | 说明 |
|---|---|
| SEO / GEO / AI 检索 | 全站 SSR、单页独立 TDK、动态 sitemap/robots、企业+文章 JSON-LD(含 GEO 坐标/服务范围)、hreflang、图片 alt 管理 |
| 主题自定义 | 后台调色板(5 色自动衍生全套视觉变量)、字体/字号/行高、圆角,运行时注入 CSS 变量 |
| 品牌配置 | 名称/LOGO/ICO/备案/版权/联系方式/社交账号、维护模式开关 |
| CMS | 栏目树/导航全自定义,Tiptap 富文本(图文/视频/链接/列表),草稿/发布/下架/定时发布,多语言内容 |
| 表单获客 | 七种字段可视化构建、服务端复验、防重复+限频、数据筛选/删除/CSV 导出、场景化关联(联系页/栏目页) |
| 用户与协议 | 邮箱注册登录、微信 PC 扫码(后台可配可关)、游客/强制登录开关、协议富文本、用户禁用管理 |
| 互动 & UGC 审核 | 阅读/点赞/转发(防刷+后台可改/清零)、评论先审后发、用户投稿(指定栏目)审核、敏感词库、四项独立总开关 |
| 运维内置 | PV/UV 看板、一键备份(SQLite 热备+文件 zip)、404/500 文案可配、本地全资源存储 |

## 技术栈

| 层 | 选型 |
|---|---|
| 架构 | Next.js 15(App Router)全栈单体 |
| UI / 样式 | shadcn/ui + Tailwind CSS(CSS 变量驱动主题) |
| 多语言 | next-intl(静态文案可被后台 DB 覆盖) |
| 数据库 | SQLite(WAL) + Prisma ORM |
| 认证 | 自研轻量 JWT(httpOnly cookie;管理员/用户双体系隔离) |
| 富文本 | Tiptap |
| 文件存储 | 服务器本地 uploads/(sharp 自动压缩;禁止云存储) |
| 部署 | Docker Compose 单容器(自动 migrate + seed) |

## 快速开始

**生产部署** → 见 [docs/部署说明.md](docs/部署说明.md)(一条命令):

```bash
docker compose -f docker/docker-compose.yml up -d --build
```

**本地开发**(Node.js ≥ 20):

```bash
npm install
cp .env.example .env
npx prisma db push
npx prisma db seed
npm run dev
```

- 前台 <http://localhost:3000> · 后台 <http://localhost:3000/zh-CN/admin>
- 默认管理员 `admin` / `admin888`(首次登录强制改密)

**运营手册** → [docs/后台使用手册.md](docs/后台使用手册.md)
**架构设计** → [docs/架构设计文档.md](docs/架构设计文档.md) · **开发计划与验收门禁** → [docs/开发计划.md](docs/开发计划.md)

## 目录结构

```
src/
├─ app/[locale]/(site)     前台官网(SSR):首页/栏目/详情/联系/登录注册/投稿/协议
├─ app/[locale]/(admin)    管理后台:看板/内容/栏目/导航/文件/表单/审核/用户/配置/备份
├─ app/api                 接口(Route Handlers,薄壳)
├─ server/                 业务服务层(全部业务逻辑;页面/接口不得直连 Prisma)
├─ lib/                    基础设施(db/config/auth/i18n/storage/seo/ugc/theme)
├─ components/             ui(shadcn)/site/admin/seo 组件
└─ i18n/ + messages/       多语言路由与文案
prisma/                    数据模型 + 种子(幂等,不覆盖客户配置)
docker/                    Dockerfile / compose / entrypoint(一键初始化)
data/ uploads/ backups/    运行时数据(volume 挂载,重建容器不丢)
```

## 核心工程铁律

1. 页面/接口**不直接调用 Prisma**,一律经 `src/server/**` 服务层。
2. 展示型配置**零硬编码**,全部入库并经缓存管线读取,后台保存即失效即生效。
3. UGC(评论、投稿)默认**待审核**,任何路径下无自动上线。
4. 静态资源只走本地存储,**无任何云 SDK**。
5. UI 只用 shadcn/ui + Tailwind;关键逻辑中文注释,适配 AI 迭代维护。

> 以 `docs/` 下文档为开发与交付准绳。
