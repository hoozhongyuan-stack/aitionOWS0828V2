/**
 * V4.8.0 拟真互动数据 · 本地演示数据(仅本地,绝不进生产)
 *
 * 用途:在本地库里造一组"树龄不同"的演示文章,便于肉眼判断拟真曲线像不像真的。
 * 注意:本脚本**不在** prisma/seed.ts 中,容器启动/生产构建都不会执行它。
 * 幂等:同 slug 已存在则跳过(可重复运行)。
 *
 * ⚠️ 防误触:必须显式带 --yes 才会执行(红线:演示数据绝不进生产)。
 * 用法:npx tsx scripts/demo-virtual-stats-seed.ts --yes
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CAT_SLUG = "v480-demo";
const AUTHOR = "数字中圆";

/** [slug 后缀, 标题, 发布于多少小时前, 拟真模式, 自定义基数] */
const ARTICLES: [string, string, number, string, number | null][] = [
  ["fresh", "刚发布：宴席酒扫码营销怎么做？", 1, "AUTO", null],
  ["day1", "发布 1 天：烟酒店社群运营的三个抓手", 24, "AUTO", null],
  ["day3", "发布 3 天：一物一码防窜货的落地清单", 72, "AUTO", null],
  ["day7", "发布 7 天：区域酒企做即时零售的组织准备", 24 * 7, "AUTO", null],
  ["day30", "发布 30 天：封坛酒数字化的完整链路", 24 * 30, "AUTO", null],
  ["day90", "发布 90 天：回厂游如何变成持续获客入口", 24 * 90, "AUTO", null],
  ["hot", "自定义基数：一次成功的宴席场景增长复盘", 24 * 10, "CUSTOM", 1500],
  ["off", "关闭拟真：本篇只看真实数据（对照用）", 24 * 5, "OFF", null],
];

async function main() {
  if (!process.argv.includes("--yes")) {
    console.error(
      "拒绝执行:本脚本会写入演示内容。\n" +
        "确认当前 DATABASE_URL 指向的是本地库后,显式加 --yes 再运行:\n" +
        "  npx tsx scripts/demo-virtual-stats-seed.ts --yes"
    );
    process.exit(1);
  }
  console.log(`目标库:${process.env.DATABASE_URL ?? "(默认 .env 配置)"}`);
  const cat = await prisma.category.upsert({
    where: { slug: CAT_SLUG },
    update: {},
    create: {
      slug: CAT_SLUG,
      moduleType: "article",
      visible: true,
      sort: 99,
      translations: {
        create: { locale: "zh-CN", name: "拟真数据演示" },
      },
    },
  });

  let created = 0;
  let skipped = 0;
  for (const [suffix, title, hoursAgo, mode, base] of ARTICLES) {
    const slug = `${CAT_SLUG}-${suffix}`;
    const exists = await prisma.content.findUnique({ where: { slug } });
    if (exists) {
      skipped++;
      continue;
    }
    await prisma.content.create({
      data: {
        slug,
        categoryId: cat.id,
        status: "PUBLISHED",
        authorName: AUTHOR,
        publishAt: new Date(Date.now() - hoursAgo * 3600_000),
        statsMode: mode,
        statsBase: base,
        translations: {
          create: {
            locale: "zh-CN",
            title,
            summary: "本地演示数据(V4.8.0 拟真互动数据),用于核对阅读/点赞/转发的增长曲线是否自然。",
            body: "<p>这是本地演示正文,仅用于观察互动数字的拟真表现。</p>",
            seoKeywords: "拟真数据,演示",
          },
        },
      },
    });
    created++;
  }

  // 给"发布 3 天"与"发布 30 天"两篇造一点真实阅读(逐日明细),演示放大延迟释放
  for (const suffix of ["day3", "day30"]) {
    const c = await prisma.content.findUnique({ where: { slug: `${CAT_SLUG}-${suffix}` } });
    if (!c) continue;
    const dayStr = (back: number) => {
      const d = new Date();
      d.setDate(d.getDate() - back);
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    for (const [back, views] of [
      [2, 3],
      [1, 2],
      [0, 1],
    ] as const) {
      await prisma.contentDailyView.upsert({
        where: { contentId_date: { contentId: c.id, date: dayStr(back) } },
        update: { views },
        create: { contentId: c.id, date: dayStr(back), views },
      });
    }
  }

  console.log(`演示栏目:/zh-CN/c/${CAT_SLUG}`);
  console.log(`新建 ${created} 篇,跳过已存在 ${skipped} 篇(重复运行安全)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
