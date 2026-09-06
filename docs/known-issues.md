# 已知问题登记(2026-09-05)

> V3.2 上线后用户验收发现的待修问题。均未修复,按优先级排队。

| ID | 级别 | 问题 | 根因(已定位) | 修复方案 |
|---|---|---|---|---|
| DEF-013 | Medium | GEO 监测路径双重 locale 前缀(/en/en/product/…),路径显示失真 | [locale]/layout 记录点 x-geo-path(已含 locale)+ 代码再次拼接 locale | 一行修复:去掉 layout 记录点的重复拼接 |
| DEF-015 | **High** | 栏目页「杂志」布局预设未生效——后台已保存 magazine,前台仍渲染现状网格 | 实现遗漏:V3.2 只实现了首页三分支,栏目页 c/[slug] 未实现 magazine/list 分支消费(getCategoryLayout 服务层已就绪) | 栏目页按 preset 分支渲染 magazine 变体(首条大图特写+双列+侧栏);约半天 |
| Low | 监测白名单缺国内引擎 UA(腾讯混元/Kimi/百度等)——这些爬虫来访问不会被识别归类 | server/geo AI_BOTS 常量表未覆盖 | 白名单追加枚举(纯常量) |

## 已验证生效项(V3.2 验收通过部分)

- 首页 hero-list 布局 ✅(浏览器截图确认:深空渐变+极光光晕+列表式动态)
- GEO 监测:GPTBot 抓取记录 27 次/天 ✅(数据真实积累中)
- 微信开放平台校验文件 ✅(https://aition.art/fejKunK1BB.txt 200)
- 后台「页面布局」配置保存 ✅(Setting category.preset=magazine 持久化正确)
