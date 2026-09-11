#!/usr/bin/env node
/**
 * AitionOWS × WorkBuddy 一键接入。
 *
 * 做四件事：
 *   ① 环境检查（node 版本、项目文件完整性）
 *   ② 令牌准备（本地地址自动签发；远程地址需显式传入）
 *   ③ 写入/合并 ~/.workbuddy/mcp.json（原文件自动备份，**不覆盖**你的其他连接器）
 *   ④ 复制「官网文章规范」技能到 ~/.workbuddy/skills/
 *
 * 用法：
 *   node install.mjs                                      # 本地联调（自动签发本地令牌）
 *   node install.mjs --base https://aition.art --token eyJ...
 *   node install.mjs --dry-run                            # 只预览将做什么，不落盘
 *   node install.mjs --name aition-site                   # 自定义连接器名
 *
 * 安全：任何写入前先备份；现有 mcp.json 非法 JSON 时中止而非覆盖。
 */
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url)); // tools/workbuddy-mcp
const PROJECT_ROOT = join(HERE, "..", "..");
const WB_DIR = join(homedir(), ".workbuddy");
const WB_MCP = join(WB_DIR, "mcp.json");
const WB_SKILLS = join(WB_DIR, "skills");
const SKILL_NAME = "aition-article-spec";
const SKILL_SRC = join(HERE, "skills", SKILL_NAME);

// ── 参数 ──────────────────────────────────────────────
const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
};
const BASE = opt("base", "http://localhost:3000");
const NAME = opt("name", "aition-content");
const AUTHOR = opt("author", "编辑部");
const DRY = argv.includes("--dry-run");
let TOKEN = opt("token", null);

const say = (s = "") => console.log(s);
const step = (n, s) => console.log(`\n[${n}/4] ${s}`);
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE);

say("AitionOWS × WorkBuddy 一键接入");
say("────────────────────────────────");
say(`  项目根   : ${PROJECT_ROOT}`);
say(`  官网地址 : ${BASE}${isLocal ? "（本地）" : "（远程）"}`);
say(`  连接器名 : ${NAME}`);
if (DRY) say("  模式     : dry-run（只预览，不写任何文件）");

// ── ① 环境检查 ────────────────────────────────────────
step(1, "环境检查");
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 20) {
  console.error(`✗ 需要 Node.js ≥ 20，当前 ${process.versions.node}`);
  process.exit(1);
}
say(`  ✓ Node.js ${process.versions.node}`);

const serverEntry = join(HERE, "index.js");
if (!existsSync(serverEntry)) {
  console.error(`✗ 找不到 MCP server 入口：${serverEntry}`);
  process.exit(1);
}
if (!existsSync(join(HERE, "node_modules", "@modelcontextprotocol"))) {
  console.error("✗ 依赖未安装。请先执行：cd tools/workbuddy-mcp && npm install");
  process.exit(1);
}
say("  ✓ MCP server 与依赖就绪");

// ── ② 令牌准备 ────────────────────────────────────────
step(2, "令牌准备");
if (!TOKEN && isLocal) {
  const script = join(PROJECT_ROOT, "scripts", "issue-admin-token.ts");
  if (existsSync(script)) {
    process.stdout.write("  本地地址：正在自动签发令牌…");
    try {
      const out = execSync(`npx tsx "${script}" admin 365d`, {
        cwd: PROJECT_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      const m = out.match(/(eyJ[\w-]+\.[\w-]+\.[\w-]+)/);
      TOKEN = m ? m[1] : null;
      say(TOKEN ? " ✓" : " 失败");
    } catch {
      say(" 失败");
    }
  }
}
if (!TOKEN) {
  console.error("\n✗ 未提供令牌。远程站点请先签发再传入：");
  console.error("  ① 在能访问站点数据库的机器上执行：");
  console.error("     AUTH_SECRET='<服务器上的 AUTH_SECRET>' npx tsx scripts/issue-admin-token.ts <子账号> 365d");
  console.error("  ② 然后带上令牌重跑本脚本：");
  console.error(`     node install.mjs --base ${BASE} --token eyJ...`);
  console.error("\n  （建议用只勾「内容管理」的 STAFF 子账号，而不是主账号）");
  process.exit(1);
}
say(`  ✓ 令牌已就绪（${TOKEN.length} 字符${isLocal ? "，本地自动签发" : ""}）`);

// ── ③ 写入/合并 mcp.json ──────────────────────────────
step(3, "写入 WorkBuddy MCP 配置");
let cfg = { mcpServers: {} };
let existed = false;
if (existsSync(WB_MCP)) {
  existed = true;
  try {
    cfg = JSON.parse(readFileSync(WB_MCP, "utf8"));
    if (!cfg || typeof cfg !== "object") throw new Error("顶层不是对象");
    if (!cfg.mcpServers || typeof cfg.mcpServers !== "object") cfg.mcpServers = {};
  } catch (e) {
    console.error(`✗ 现有 ${WB_MCP} 不是合法 JSON（${e.message}）`);
    console.error("  为避免破坏你的配置，已中止。请先修复该文件，或手动加入下面的配置：");
    console.error(JSON.stringify(buildServerBlock(), null, 2));
    process.exit(1);
  }
}
cfg.mcpServers[NAME] = buildServerBlock();

function buildServerBlock() {
  return {
    type: "stdio",
    command: "node",
    args: [serverEntry],
    env: {
      AITION_API_BASE: BASE,
      AITION_API_TOKEN: TOKEN,
      AITION_AUTHOR: AUTHOR,
    },
    runtime: { type: "node", version: `>=${nodeMajor}` },
    timeout: 60000,
  };
}

const others = Object.keys(cfg.mcpServers).filter((k) => k !== NAME);
say(`  现有配置: ${existed ? `是（含 ${others.length} 个其他服务${others.length ? "：" + others.slice(0, 3).join("、") + (others.length > 3 ? "…" : "") : ""}）` : "否（将新建）"}`);
say(`  将写入 : ${NAME} → ${serverEntry}`);

if (!DRY) {
  mkdirSync(WB_DIR, { recursive: true });
  if (existed) {
    const bak = `${WB_MCP}.bak-${Date.now()}`;
    renameSync(WB_MCP, bak);
    say(`  ✓ 原配置已备份 → ${bak}`);
  }
  writeFileSync(WB_MCP, JSON.stringify(cfg, null, 2) + "\n");
  say(`  ✓ 已写入 ${WB_MCP}`);
} else {
  say("  （dry-run：跳过写入）");
}

// ── ④ 安装技能 ────────────────────────────────────────
step(4, "安装「官网文章规范」技能");
if (!existsSync(SKILL_SRC)) {
  say(`  ⚠ 未找到技能源目录，跳过：${SKILL_SRC}`);
} else {
  const dst = join(WB_SKILLS, SKILL_NAME);
  if (!DRY) {
    mkdirSync(WB_SKILLS, { recursive: true });
    cpSync(SKILL_SRC, dst, { recursive: true });
    say(`  ✓ 已安装 → ${dst}`);
  } else {
    say(`  （dry-run：将复制到 ${dst}）`);
  }
}

// ── 收尾 ──────────────────────────────────────────────
say("\n────────────────────────────────");
if (DRY) {
  say("dry-run 完成，未改动任何文件。去掉 --dry-run 即真正执行。");
} else {
  say("✅ 接入完成，接下来：");
  say("   1. 重启 WorkBuddy（让配置与技能生效）");
  say("   2. 首次连接会弹「是否信任该 MCP」，点确认");
  say("   3. 在对话里问「你有哪些可用的工具？」验证能看到 aition-content 的 5 个工具");
  if (isLocal) {
    say("\n注意：当前指向本地 http://localhost:3000 —— 使用前需先跑 npm run dev；");
    say("      部署生产后重跑本脚本并传 --base https://aition.art --token <生产令牌> 即可切换。");
  }
  say("\n自检命令（可选）：");
  say(`   AITION_API_BASE=${BASE} AITION_API_TOKEN='<令牌>' node self-check.mjs`);
}
