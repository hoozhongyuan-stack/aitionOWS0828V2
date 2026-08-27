import { prisma } from "@/lib/db";

/**
 * 轻量访问统计(需求 5 看板):按天聚合 PV/UV,'*' 行为全站汇总。
 * UV 以客户端持久化 visitorId 为准(当天首次访问计 1)。
 */

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 当天已计 UV 的访客集合(进程内存;跨天自动重建)
const g = globalThis as unknown as { __aitionUv?: { date: string; seen: Set<string> } };

/** 记录一次页面访问 */
export async function trackPageView(path: string, visitorId: string): Promise<void> {
  const date = today();
  if (!g.__aitionUv || g.__aitionUv.date !== date) {
    g.__aitionUv = { date, seen: new Set() };
  }
  const isNewVisitor = !g.__aitionUv.seen.has(visitorId);
  if (isNewVisitor) g.__aitionUv.seen.add(visitorId);

  const uvInc = isNewVisitor ? 1 : 0;
  // 全站汇总行 + 具体路径行
  for (const p of ["*", path.slice(0, 200)]) {
    await prisma.dailyStat.upsert({
      where: { date_path: { date, path: p } },
      update: { pv: { increment: 1 }, ...(uvInc ? { uv: { increment: 1 } } : {}) },
      create: { date, path: p, pv: 1, uv: uvInc },
    });
  }
}

/** 看板数据:今日/近 7 天趋势 + 业务总量 */
export async function getDashboardStats() {
  const date = today();
  const pad = (n: number) => String(n).padStart(2, "0");
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600_000);
    days.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }

  const [todayRow, weekRows, contentCount, userCount, pendingComments, pendingSubmissions, formCount, submissionTotal] =
    await Promise.all([
      prisma.dailyStat.findUnique({ where: { date_path: { date, path: "*" } } }),
      prisma.dailyStat.findMany({ where: { path: "*", date: { in: days } } }),
      prisma.content.count({ where: { status: "PUBLISHED" } }),
      prisma.user.count(),
      prisma.comment.count({ where: { status: "PENDING" } }),
      prisma.content.count({ where: { source: "UGC", status: "PENDING" } }),
      prisma.form.count(),
      prisma.formSubmission.count(),
    ]);

  const byDate = new Map(weekRows.map((r) => [r.date, r]));
  return {
    today: { pv: todayRow?.pv ?? 0, uv: todayRow?.uv ?? 0 },
    week: days.map((d) => ({ date: d.slice(5), pv: byDate.get(d)?.pv ?? 0, uv: byDate.get(d)?.uv ?? 0 })),
    totals: {
      contents: contentCount,
      users: userCount,
      pendingComments,
      pendingSubmissions,
      forms: formCount,
      formSubmissions: submissionTotal,
    },
  };
}
