import { z } from "zod";
import { jsonOk, jsonErr, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { listWords, addWords, removeWord } from "@/server/ugc";

/** 敏感词管理:GET / POST {words:[]}(批量添加)/ DELETE ?id= */

const postSchema = z.object({ words: z.array(z.string().min(1)).min(1) });

export async function GET() {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  return jsonOk(await listWords());
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const parsed = await parseBody(req, postSchema);
  if (parsed.error) return parsed.error;
  await addWords(parsed.data.words);
  return jsonOk();
}

export async function DELETE(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return jsonErr("缺少 id");
  await removeWord(id);
  return jsonOk();
}
