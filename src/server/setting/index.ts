import { prisma } from "@/lib/db";
import { revalidateTag } from "next/cache";

/**
 * 配置服务(产品核心承诺的实现):
 *   后台保存 → 写 Setting 表 → 清进程内缓存 + revalidateTag
 *   前台读取 → 命中进程内缓存(未命中查库回填)
 * 效果:改完即生效,无需重启、无需重新编译。
 *
 * 缓存挂在 globalThis 上,兼容 dev 热重载不重复失效。
 */

type GroupCache = Map<string, Record<string, unknown>>;
const g = globalThis as unknown as { __aitionSettingCache?: GroupCache };
const cache: GroupCache = (g.__aitionSettingCache ??= new Map());

/** 读取一个配置分组(JSON 已解析) */
export async function getSettingGroup(group: string): Promise<Record<string, unknown>> {
  const hit = cache.get(group);
  if (hit) return hit;
  const rows = await prisma.setting.findMany({ where: { group } });
  const obj: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      obj[r.key] = JSON.parse(r.value);
    } catch {
      obj[r.key] = r.value; // 容错:历史脏数据按原文返回
    }
  }
  cache.set(group, obj);
  return obj;
}

/** 保存一个配置分组(部分键即可),并使缓存失效 */
export async function saveSettingGroup(group: string, values: Record<string, unknown>): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    await prisma.setting.upsert({
      where: { group_key: { group, key } },
      update: { value: JSON.stringify(value) },
      create: { group, key, value: JSON.stringify(value) },
    });
  }
  invalidateSettingCache(group);
}

/** 失效配置缓存(供本服务与备份恢复等场景调用) */
export function invalidateSettingCache(group?: string): void {
  if (group) cache.delete(group);
  else cache.clear();
  try {
    // 同步失效基于 tag 的数据缓存(页面/查询层使用)
    revalidateTag("settings");
    if (group) revalidateTag(`settings:${group}`);
  } catch {
    // 在非请求上下文(如 seed 脚本)调用时忽略
  }
}

/**
 * 站点级"开关"的无缓存读取 —— 专供 /api/flags(middleware 判断维护模式/强制登录的数据源)。
 *
 * 测试反馈缺陷5(维护模式不生效)修复:上面的 getSettingGroup 缓存挂在 globalThis,
 * 只在"当前 Node 进程"内有效。若部署方式是多进程/多实例(如 pm2 cluster、多副本容器、
 * 反向代理轮询多个后端),后台保存维护模式时只会清掉处理那次保存请求的进程的缓存,
 * 其余进程仍缓存着旧值,导致中间件读到"未开启",看起来开关不生效。
 * 维护模式这类必须实时生效的开关,查询频率低、数据量小,直接查库更稳妥,牺牲的性能可忽略。
 */
export async function getRuntimeFlags(): Promise<{ maintenance: boolean; forceLogin: boolean }> {
  const rows = await prisma.setting.findMany({
    where: {
      OR: [
        { group: "brand", key: "maintenance" },
        { group: "features", key: "forceLogin" },
      ],
    },
  });
  const parseBool = (v?: string) => {
    if (!v) return false;
    try {
      return JSON.parse(v) === true;
    } catch {
      return false;
    }
  };
  const find = (group: string, key: string) => rows.find((r) => r.group === group && r.key === key)?.value;
  return {
    maintenance: parseBool(find("brand", "maintenance")),
    forceLogin: parseBool(find("features", "forceLogin")),
  };
}
