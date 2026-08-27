import { z } from "zod";
import { jsonOk, jsonErr, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { listUsersAdmin, setUserStatus } from "@/server/user";

/** 后台用户管理:GET 列表(搜索/分页)/ POST 启用/禁用(需求 4.6) */

const postSchema = z.object({
  id: z.number().int(),
  status: z.enum(["ACTIVE", "DISABLED"]),
});

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const sp = new URL(req.url).searchParams;
  return jsonOk(
    await listUsersAdmin({
      page: Number(sp.get("page")) || 1,
      keyword: sp.get("keyword") || undefined,
    })
  );
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const parsed = await parseBody(req, postSchema);
  if (parsed.error) return parsed.error;
  try {
    await setUserStatus(parsed.data.id, parsed.data.status);
    return jsonOk();
  } catch (e) {
    return jsonErr(e instanceof Error ? e.message : "操作失败");
  }
}
