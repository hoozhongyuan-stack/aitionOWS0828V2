/**
 * 存量封面回填(V4.7.4):为已发布文章的封面生成 WebP 显示版 + JPG 分享伴生。
 *
 * 背景:此版本之前,PNG 上传走原格式重编码(无损),AI 海报类图片单张 1.3~2.9MB。
 * 本脚本一期只处理**文章封面**(正文图有懒加载兜底,批量改正文 HTML 风险高、留二期)。
 *
 * 行为:
 *   - 逐张读取 uploads/ 原文件 → WebP q82(宽≤1600) + JPG q85(宽≤1200)
 *   - WebP 不小于原文件 → 跳过(压了没收益)
 *   - 写 <同名>.webp / <同名>.jpg,登记两条 MediaAsset(继承原资产的 alt/folderId 等),
 *     原**资产行与物理文件都不动**(回滚安全)
 *   - 更新 Content.coverUrl 指向 WebP 版
 *   - 幂等:同名 .webp 资产已存在即跳过
 *
 * 用法:
 *   node scripts/backfill-cover-variants.mjs          # dry-run,只报告
 *   node scripts/backfill-cover-variants.mjs --apply  # 真实执行
 */
const path = require("node:path");
const fs = require("node:fs");
const sharp = require("sharp");

const APPLY = process.argv.includes("--apply");
const UPLOAD_ROOT = path.resolve(process.cwd(), process.env.UPLOAD_DIR || "./uploads");

async function main() {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();

  const contents = await prisma.content.findMany({
    where: { coverUrl: { startsWith: "/uploads/" } },
    select: { id: true, slug: true, coverUrl: true },
  });
  console.log(`待检文章: ${contents.length} 篇(APPLY=${APPLY})`);

  let done = 0, skipped = 0, failed = 0, savedBytes = 0;
  for (const c of contents) {
    try {
      const rel = decodeURIComponent(c.coverUrl.replace("/uploads/", ""));
      if (rel.toLowerCase().endsWith(".webp")) { skipped++; continue; } // 已是 WebP
      const asset = await prisma.mediaAsset.findFirst({ where: { path: rel } });
      if (!asset || !["image/jpeg", "image/png", "image/webp"].includes(asset.mime)) { skipped++; continue; }

      const stem = rel.replace(/\.[^.]+$/, "");
      const webpRel = `${stem}.webp`;
      const shareRel = `${stem}-share.jpg`; // 不能用 stem.jpg:原封面是 .jpg 时会与原资产同路径撞车(V4.7.4 首跑实测)
      const existed = await prisma.mediaAsset.findFirst({ where: { path: { in: [webpRel, shareRel] } } });
      if (existed) { skipped++; continue; } // 幂等:显示版或伴生任一存在即跳过

      const abs = path.join(UPLOAD_ROOT, rel);
      if (!fs.existsSync(abs)) { console.log(`  ⚠️ 原文件缺失: ${rel}`); skipped++; continue; }
      const buf = fs.readFileSync(abs);

      const webp = await sharp(buf, { failOn: "none" })
        .resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
      if (webp.length >= buf.length) { console.log(`  - 无收益,跳过: ${rel}`); skipped++; continue; }
      const jpg = await sharp(buf, { failOn: "none" })
        .resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 85, mozjpeg: true }).toBuffer();

      const base = {
        filename: (asset.filename || "").replace(/\.[^.]+$/, "") + ".webp",
        mime: "image/webp", size: webp.length,
        alt: asset.alt, uploaderType: asset.uploaderType, uploaderId: asset.uploaderId, folderId: asset.folderId,
      };

      // dims 用 sharp 实测(显示版),不继承原资产 —— 防继承到空值
      const wmeta = await sharp(webp).metadata();
      const dims = { width: wmeta.width ?? null, height: wmeta.height ?? null };
      if (APPLY) {
        fs.writeFileSync(path.join(UPLOAD_ROOT, webpRel), webp);
        fs.writeFileSync(path.join(UPLOAD_ROOT, shareRel), jpg);
        await prisma.mediaAsset.create({ data: { path: webpRel, ...base, ...dims } });
        await prisma.mediaAsset.create({
          data: { path: shareRel, ...base, filename: base.filename.replace(/\.webp$/, ".jpg"), mime: "image/jpeg", size: jpg.length, ...dims },
        });
        await prisma.content.update({ where: { id: c.id }, data: { coverUrl: `/uploads/${webpRel}` } });
      }
      savedBytes += buf.length - webp.length;
      done++;
      console.log(`  ✓ [${c.slug}] ${rel} → ${webpRel}  ${(buf.length / 1024).toFixed(0)}KB → ${(webp.length / 1024).toFixed(0)}KB`);
    } catch (e) {
      failed++;
      console.log(`  ✗ [${c.slug}] ${e.message}`);
    }
  }

  console.log(`\n完成: 处理 ${done} / 跳过 ${skipped} / 失败 ${failed};预计节省 ${(savedBytes / 1024 / 1024).toFixed(1)}MB`);
  console.log(APPLY ? "(已 APPLY,数据与文件已更新)" : "(dry-run,加 --apply 执行)");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
