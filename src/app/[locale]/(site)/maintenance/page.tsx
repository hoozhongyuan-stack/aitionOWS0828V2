import { setRequestLocale } from "next-intl/server";
import { getBrandConfig } from "@/lib/config";
import { Wrench } from "lucide-react";

/**
 * 维护模式提示页(middleware 在维护开关开启时把前台流量改写到这里)。
 * 文案来自后台「品牌信息 → 维护模式」配置。
 */
export default async function MaintenancePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const brand = await getBrandConfig();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Wrench className="h-8 w-8 text-muted-foreground" />
      </div>
      <h1 className="text-2xl font-semibold">{brand.siteName}</h1>
      <p className="max-w-md text-muted-foreground">{brand.maintenanceText}</p>
    </main>
  );
}
