import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { getFeatureFlags } from "@/lib/config";
import { getUserSession } from "@/lib/auth/session";
import { listSubmittableCategories } from "@/server/content";
import { SubmitForm } from "@/components/site/submit-form";
import { Inbox } from "lucide-react";

/**
 * 投稿页(需求 4.8):
 * 总开关关闭 → 提示未开放;未登录 → 跳登录;仅列出允许投稿的栏目。
 */
export default async function SubmitPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [features, user, t] = await Promise.all([
    getFeatureFlags(),
    getUserSession(),
    getTranslations("submission"),
  ]);

  if (!features.submission) {
    return (
      <main className="container flex min-h-[50vh] max-w-2xl flex-col items-center justify-center gap-3 py-16 text-center">
        <Inbox className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">{t("closed")}</p>
      </main>
    );
  }

  if (!user) redirect(`/${locale}/login?next=/${locale}/submit`);

  const categories = await listSubmittableCategories(locale);

  return (
    <main className="container max-w-3xl py-10">
      <h1 className="mb-6 font-heading text-2xl font-bold">{t("title")}</h1>
      {categories.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {t("noCategory")}
        </div>
      ) : (
        <SubmitForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
      )}
    </main>
  );
}
