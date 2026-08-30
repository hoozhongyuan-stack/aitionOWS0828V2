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
