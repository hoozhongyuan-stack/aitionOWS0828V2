/**
 * 批量操作通用执行器(V4.4.0)。
 *
 * 设计原则:
 *  1. **逐项执行并汇报**(不做"全成功或全失败")——业务规则会拦下部分项
 *     (如"栏目含子栏目或内容时禁删"),必须能告诉用户"哪几条、为什么没做成";
 *  2. **单次上限**防手滑(默认 100 条),超限直接拒绝并要求分批;
 *  3. **服务层复用单条逻辑**——批量与单个操作的行为规则永远一致
 *     (这是本节最容易出偏差的地方:另写一套批量逻辑必然与单个规则漂移)。
 */

/** 单次批量上限(超出拒绝,防误操作全库) */
export const BATCH_MAX = 100;

export interface BatchOutcome {
  ok: number[];
  skipped: { id: number; reason: string }[];
}

/**
 * 把异常转成用户可读的跳过原因（批量回执会直接展示给用户）。
 * - 业务规则抛出的中文错误（如"栏目下还有内容"）原样保留；
 * - Prisma 的技术性异常（记录不存在、SQL/堆栈细节）不外泄，转为可操作提示。
 */
function friendlyReason(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/No record was found|Record to delete does not exist|Record to update not found/i.test(raw)) {
    return "目标不存在或已被删除";
  }
  if (/prisma\.|invocation|Invalid `/.test(raw)) {
    return "操作失败（数据状态已变化，请刷新后重试）";
  }
  return raw.split("\n")[0].slice(0, 120) || "未知原因";
}

/**
 * 逐项执行批量动作。
 * @param ids 目标 id 列表(调用方应先过 normalizeBatchIds)
 * @param handler 单条动作(直接复用服务层的单条函数)
 */
export async function runBatch(
  ids: number[],
  handler: (id: number) => Promise<void>
): Promise<BatchOutcome> {
  const outcome: BatchOutcome = { ok: [], skipped: [] };
  for (const id of ids) {
    try {
      await handler(id);
      outcome.ok.push(id);
    } catch (e) {
      // 业务规则拒绝(如栏目非空)进入 skipped,而不是让整批失败
      outcome.skipped.push({ id, reason: friendlyReason(e) });
    }
  }
  return outcome;
}

/** 清洗批量入参:去重 + 去掉非法值 + 上限校验 */
export function normalizeBatchIds(raw: number[]): { ids: number[] } | { error: string } {
  const ids = Array.from(new Set(raw.filter((n) => Number.isInteger(n) && n > 0)));
  if (ids.length === 0) return { error: "未选择任何项" };
  if (ids.length > BATCH_MAX) {
    return { error: `单次最多 ${BATCH_MAX} 项（当前 ${ids.length} 项），请分批操作` };
  }
  return { ids };
}

/** 批量结果的用户可读摘要(供前端 toast 与工具回执共用) */
export function describeOutcome(outcome: BatchOutcome): string {
  const parts = [`成功 ${outcome.ok.length} 项`];
  if (outcome.skipped.length > 0) {
    parts.push(`跳过 ${outcome.skipped.length} 项`);
    // 同类原因合并展示(如 3 条都因"栏目非空"),避免刷屏
    const byReason = new Map<string, number>();
    for (const s of outcome.skipped) byReason.set(s.reason, (byReason.get(s.reason) ?? 0) + 1);
    const detail = Array.from(byReason.entries())
      .map(([reason, n]) => `${n} 项：${reason}`)
      .join("；");
    parts.push(`（${detail}）`);
  }
  return parts.join("，");
}
