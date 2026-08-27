import Link from "next/link";
import type { BrandConfig } from "@/lib/config";

/**
 * 前台页脚(服务端组件):版权 / 备案号 / 联系方式 / 社交账号 / 协议链接。
 * 全部数据来自后台品牌配置,即时生效。
 *
 * 文字颜色说明:社交账号名/联系方式/协议链接均为 text-muted-foreground,
 * 该变量已独立于主色/文字色单独配置(见「主题外观 → 次要文字色」),后台可统一调整。
 * 社交卡片(需求②):配置了 qrcodeUrl 时常驻展示 108×108 图,名称居中于图片下方。
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
      {/* items-center:社交卡片列较高,联系我们/协议两列随之垂直居中,视觉齐平 */}
      <div className="container grid items-center gap-8 py-10 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <div className="flex items-center gap-2">
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoUrl} alt={`${brand.siteName} LOGO`} className="h-7 w-auto" />
            ) : null}
            <span className="font-heading font-semibold">{brand.siteName}</span>
          </div>
          {brand.socials.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-4">
              {brand.socials
                // 名称必填;链接与二维码至少其一(微信二维码等场景通常没有链接)
                .filter((s) => s.name && (s.url || s.qrcodeUrl))
                .map((s) => (
                  <li
                    key={s.name + (s.url || s.qrcodeUrl || "")}
                    className="flex flex-col items-center gap-2"
                  >
                    {s.qrcodeUrl && (
                      // 常驻展示(108×108):移动端没有 hover,弹层方案发现性差;
                      // 白底留白保证二维码识别率,object-contain 保证非正方形原图完整显示
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.qrcodeUrl}
                        alt={`${s.name} 二维码`}
                        width={108}
                        height={108}
                        className="h-[108px] w-[108px] rounded-lg border bg-white object-contain p-1 shadow-sm"
                      />
                    )}
                    {s.url ? (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-center text-sm text-muted-foreground hover:text-primary"
                      >
                        {s.name}
                      </a>
                    ) : (
                      <span className="cursor-default text-center text-sm text-muted-foreground">
                        {s.name}
                      </span>
                    )}
                  </li>
                ))}
            </ul>
          )}
        </div>
        {/* 板块在其网格列内水平居中(lg 起);内部条目保持左对齐 */}
        <div className="space-y-2 text-sm text-muted-foreground lg:justify-self-center">
          <div className="font-medium text-foreground">{labels.contact}</div>
          {brand.contactPhone && <div>{brand.contactPhone}</div>}
          {brand.contactEmail && <div>{brand.contactEmail}</div>}
          {brand.contactAddress && <div>{brand.contactAddress}</div>}
        </div>
        {/* 协议两链接整体靠右(lg 起) */}
        <div className="space-y-2 text-sm lg:justify-self-end">
          <Link
            href={`/${locale}/agreement/register`}
            className="block text-muted-foreground hover:text-primary"
          >
            {labels.register}
          </Link>
          <Link
            href={`/${locale}/agreement/privacy`}
            className="block text-muted-foreground hover:text-primary"
          >
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
