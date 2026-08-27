import Link from "next/link";
import type { BrandConfig } from "@/lib/config";

/**
 * 前台页脚(服务端组件):版权 / 备案号 / 联系方式 / 社交账号 / 协议链接。
 * 全部数据来自后台品牌配置,即时生效。
 *
 * 文字颜色说明:社交账号名/联系方式/协议链接均为 text-muted-foreground,
 * 该变量已独立于主色/文字色单独配置(见「主题外观 → 次要文字色」),后台可统一调整。
 * 二维码(新增需求②):配置了 qrcodeUrl 时,鼠标悬浮在账号名上弹出二维码图片。
 */
export function SiteFooter({
  brand,
  locale,
  labels,
}: {
  brand: BrandConfig;
  locale: string;
  labels: { register: string; privacy: string; contact: string };
}) {
  return (
    <footer className="border-t bg-muted/30">
      <div className="container grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <div className="flex items-center gap-2">
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoUrl} alt={`${brand.siteName} LOGO`} className="h-7 w-auto" />
            ) : null}
            <span className="font-heading font-semibold">{brand.siteName}</span>
          </div>
          {brand.socials.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-3">
              {brand.socials
                // 名称必填;链接与二维码至少其一(微信二维码等场景通常没有链接)
                .filter((s) => s.name && (s.url || s.qrcodeUrl))
                .map((s) => (
                  <li key={s.name + (s.url || s.qrcodeUrl || "")} className="group relative">
                    {s.url ? (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-muted-foreground hover:text-primary"
                      >
                        {s.name}
                      </a>
                    ) : (
                      <span className="cursor-default text-sm text-muted-foreground hover:text-primary">
                        {s.name}
                      </span>
                    )}
                    {s.qrcodeUrl && (
                      // 扫码友好:加大弹层、强制正方形白底(二维码识别需要留白静区与对比度),
                      // object-contain 保证非正方形原图也完整显示不裁切
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 rounded-xl border bg-white p-3 shadow-lg group-hover:block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.qrcodeUrl} alt={`${s.name} 二维码`} className="aspect-square h-44 w-44 object-contain" />
                      </div>
                    )}
                  </li>
                ))}
            </ul>
          )}
        </div>
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="font-medium text-foreground">{labels.contact}</div>
          {brand.contactPhone && <div>{brand.contactPhone}</div>}
          {brand.contactEmail && <div>{brand.contactEmail}</div>}
          {brand.contactAddress && <div>{brand.contactAddress}</div>}
        </div>
        <div className="space-y-2 text-sm">
          <Link href={`/${locale}/agreement/register`} className="block text-muted-foreground hover:text-primary">
            {labels.register}
          </Link>
          <Link href={`/${locale}/agreement/privacy`} className="block text-muted-foreground hover:text-primary">
            {labels.privacy}
          </Link>
        </div>
      </div>
      <div className="border-t">
        <div className="container flex flex-col items-center justify-between gap-2 py-4 text-xs text-muted-foreground sm:flex-row">
          <div>{brand.copyright}</div>
          {brand.icp && (
            <a
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary"
            >
              {brand.icp}
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}
