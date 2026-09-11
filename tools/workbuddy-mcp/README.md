# AitionOWS 内容推送 MCP Server

在 WorkBuddy（或任何 MCP 客户端）里写好文章 → 调 `push_article` → 官网生成**草稿** → 人工过目 → 发布（或用定时发布到点自动上线）。

```
┌─ WorkBuddy（你写稿、AI 帮你改）────────────────┐
│  写好后一句话："推到官网"                      │
└────────────────────┬──────────────────────────┘
                     │ MCP（stdio，本机进程）
┌────────────────────▼──────────────────────────┐
│  本工具：Markdown→白名单 HTML / 字段校验 /      │
│          slug 生成 / 封面图上传 / 查重          │
└────────────────────┬──────────────────────────┘
                     │ HTTPS + Bearer 令牌
┌────────────────────▼──────────────────────────┐
│  AitionOWS 官网后台 API（草稿入库，人工过目）    │
└───────────────────────────────────────────────┘
```

---

## 一、准备令牌（一次）

令牌由官网仓库的脚本签发，**建议用最小权限的专用子账号**（只勾「内容管理」的 STAFF 账号），而不是主账号。

```bash
cd <官网项目根>

# 本地开发（令牌签给本地站点）
npx tsx scripts/issue-admin-token.ts <用户名> 365d

# 生产（AUTH_SECRET 必须与服务器 compose 中的值完全一致）
AUTH_SECRET='<服务器上的 AUTH_SECRET>' npx tsx scripts/issue-admin-token.ts <子账号用户名> 365d
```

脚本会打印令牌、有效期和一条验证用的 curl 命令。**令牌视同密码**：只填进下面的 MCP 配置，不要提交到仓库、不要贴进对话。

> 安全提示：系统暂无会话吊销机制 —— 换密/禁用账号后旧令牌在有效期内仍可用；需要立即全部失效时改 `AUTH_SECRET` 并重启服务。

---

## 二、安装依赖（一次）

```bash
cd tools/workbuddy-mcp
npm install
```

---

## 三、配置 MCP 客户端

把下面这段加入 WorkBuddy 的 MCP 配置（用户级 `~/.workbuddy/mcp.json`，或项目级 `<项目>/.workbuddy/mcp.json`）：

```json
{
  "mcpServers": {
    "aition-ows": {
      "command": "node",
      "args": ["/绝对路径/AitionOWS/tools/workbuddy-mcp/index.js"],
      "env": {
        "AITION_API_BASE": "https://aition.art",
        "AITION_API_TOKEN": "<上一步签发的令牌>",
        "AITION_AUTHOR": "编辑部"
      }
    }
  }
}
```

- `AITION_API_BASE`：官网地址（本地调试填 `http://localhost:3000`）
- `AITION_AUTHOR`：可选，缺省作者名（不填为「编辑部」）
- 配置改完需重启 WorkBuddy 让连接器重新加载

---

## 四、连接自检

配好后先跑一次自检（验证地址与令牌真的能通）：

```bash
cd tools/workbuddy-mcp
AITION_API_BASE=https://aition.art AITION_API_TOKEN='<令牌>' node self-check.mjs
```

期望输出：握手成功 + 工具清单 + **官网栏目列表**（能看到栏目就说明令牌与网络都没问题）。

---

## 五、可用工具

| 工具 | 作用 | 何时用 |
|---|---|---|
| `list_categories` | 列出官网栏目（id/中英名称/slug/类型） | 推送前确定投哪个栏目 |
| `list_articles` | 列出已有内容（关键词/栏目/状态过滤） | 查重、了解站内风格 |
| `get_article` | 读单篇详情（各语言正文 HTML） | 改稿前先看现状 |
| `push_article` | **推送文章**（新建或更新） | 核心动作 |
| `upload_image` | 上传图片，返回可引用 URL | 正文要插内嵌图时 |

### push_article 要点

- **默认存为草稿**（`DRAFT`），人工过目后再发布 —— 这是刻意的护栏
- **中英双语**：分别传 `zh` / `en`；本站是双语站点，建议两份都写
- **正文用 Markdown**：自动转成官网白名单 HTML。正文从 `##` 起（`#` 会自动降为 `##`，因为文章标题由标题字段承担）
- 支持：标题 / 列表 / 粗体 / 斜体 / 行内代码 / 链接 / 表格 / 引用块 / 图片
- 会被剥离：内联样式、`div`/`iframe` 等自定义标签、`h4`–`h6`（工具会回报提醒）
- **封面图**：传 `coverImagePath`（本机文件路径）自动上传；正文插图先用 `upload_image` 拿 URL 再以 `![](URL)` 引用
- **定时上线**：`status: "SCHEDULED"` + `publishAt`（ISO 时间，如 `2026-09-12T09:00:00+08:00`）→ 到点由官网自动发布，不依赖你的电脑开机
- **更新已有文章**：传 `id`，只覆盖你传的字段（其余保留原值）

### 推荐流程

```
1. list_categories          → 确定栏目
2. list_articles（关键词）   → 查重，避免重复选题
3. push_article             → 推为草稿（建议带封面图）
4. 到后台过目 → 发布；或第 3 步直接带 publishAt 定时上线
```

---

## 六、常见问题

| 现象 | 处理 |
|---|---|
| `✗ 令牌无效或已过期` | 用第一节的命令重新签发，更新 MCP 配置里的 `AITION_API_TOKEN`，重启 WorkBuddy |
| `✗ 无法连接官网` | 检查 `AITION_API_BASE` 是否可达（浏览器能打开官网首页）；公司网络/代理是否放行 |
| 工具里看不到 `aition-ows` | MCP 配置路径或 JSON 格式有误；改完要重启 WorkBuddy；确认 `npm install` 已执行 |
| `✗ 未找到名为「X」的栏目` | 栏目名称要精确匹配中英文名或 slug；先 `list_categories` 看准确名称 |
| 推上去排版不对 | 看工具回执里的「格式提醒」，通常是用了内联样式或 `h4`+；改用 Markdown 语义 |
| 想撤销推送 | 在官网后台把该内容删除或下架（工具不提供删除能力——删除是不可逆动作，保留在人工侧） |

---

## 七、安装「官网文章规范」技能（强烈建议）

技能让 AI **写稿时**就遵守官网的格式与配图规范，而不是推上去再返工。规范文件在 `skills/aition-article-spec/SKILL.md`，涵盖：正文格式硬约束（从 `##` 起、禁用内联样式等）、封面图尺寸与视觉风格、SEO/GEO 写法、推送流程。

安装方式任选：

**方式 A：放进技能目录**（推荐，若你的 WorkBuddy 版本支持技能目录）

```bash
# 按 WorkBuddy 官方文档的技能目录放置，通常形如：
mkdir -p ~/.workbuddy/skills
cp -r skills/aition-article-spec ~/.workbuddy/skills/
```

重启后，让 AI「写一篇官网文章」时它会自动加载这些规范。

**方式 B：对话里教一次**（无需文件）

把 `skills/aition-article-spec/SKILL.md` 的内容贴给 WorkBuddy，说"这是官网文章规范，写官网文章时遵守"。

**方式 C：通过 SkillHub 打包发布**（如需团队共用）

按 WorkBuddy 开放平台的 Skill 规范打包提审。

---

## 八、目录结构

```
tools/workbuddy-mcp/
├── index.js                    # MCP server 入口与工具定义
├── src/
│   ├── api.js                  # 官网后台 API 客户端（Bearer 认证）
│   ├── md-to-html.js           # Markdown → 官网白名单 HTML（与前端 src/lib/sanitize.ts 对齐）
│   └── validate.js             # 硬校验、slug 生成、栏目定位
├── skills/
│   └── aition-article-spec/
│       └── SKILL.md            # 「官网文章规范」技能（写作/配图/SEO/推送流程）
├── self-check.mjs              # 连接自检
├── package.json
└── README.md
```
