/**
 * 连接自检：起 MCP server 子进程，走完整协议握手并真实调用 list_categories，验证地址与令牌是否可用。
 * 用法：AITION_API_BASE=... AITION_API_TOKEN=... node self-check.mjs
 */
import { spawn } from "node:child_process";

const child = spawn("node", ["index.js"], {
  cwd: import.meta.dirname,
  env: { ...process.env },
  stdio: ["pipe", "pipe", "pipe"],
});

const send = (obj) => child.stdin.write(JSON.stringify(obj) + "\n");
const responses = [];
let buf = "";
child.stdout.on("data", (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (line) {
      try {
        responses.push(JSON.parse(line));
      } catch {
        /* 忽略非 JSON 行 */
      }
    }
  }
});
child.stderr.on("data", (d) => process.stderr.write("[server] " + d.toString()));

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke", version: "0" } },
});
send({ jsonrpc: "2.0", method: "notifications/initialized" });
send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_categories", arguments: {} } });

setTimeout(() => {
  const init = responses.find((r) => r.id === 1);
  console.log("\n=== 1. 握手 ===");
  console.log(init?.result ? `✓ ${init.result.serverInfo.name} v${init.result.serverInfo.version}` : "✗ 握手失败");

  console.log("\n=== 2. 工具列表 ===");
  const tools = responses.find((r) => r.id === 2)?.result?.tools ?? [];
  console.log(tools.length ? tools.map((t) => `- ${t.name}`).join("\n") : "✗ 无工具");

  console.log("\n=== 3. list_categories 真实调用 ===");
  const call = responses.find((r) => r.id === 3);
  const text = call?.result?.content?.[0]?.text;
  console.log(call?.result?.isError ? `✗ ${text}` : text ?? JSON.stringify(call?.error ?? "(无响应)"));

  child.kill();
  process.exit(0);
}, 9000);
