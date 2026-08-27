import { z } from "zod";
import { jsonOk, jsonErr, parseBody, getClientIp } from "@/lib/api";
import { submitForm } from "@/server/form";
import { rateLimit } from "@/lib/ugc/anti-spam";

/**
 * 表单公开提交:POST /api/form/[slug] { data: { 字段id: 值 } }
 * 服务端全量校验 + 敏感词 + 指纹防重复 + IP 限频(需求 4.5)。
 */
const schema = z.object({ data: z.record(z.string(), z.unknown()) });

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const parsed = await parseBody(req, schema);
  if (parsed.error) return parsed.error;

  const ip = getClientIp(req);
  if (!rateLimit(`form:${ip}`, 3, 60_000)) return jsonErr("提交过于频繁,请稍后再试", 429);

  try {
    await submitForm({
      slug,
      data: parsed.data.data,
      ip,
      userAgent: req.headers.get("user-agent"),
    });
    return jsonOk();
  } catch (e) {
    return jsonErr(e instanceof Error ? e.message : "提交失败");
  }
}
