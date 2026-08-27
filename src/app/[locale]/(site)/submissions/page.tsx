import Link from "next/link";
import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { getUserSession } from "@/lib/auth/session";
import { listMySubmissions } from "@/server/ugc";
import { Badge } from "@/components/ui/badge";

/** 我的投稿(需求 4.8):查看各投稿审核状态 */
export default async function MySubmissionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getUserSession();
  if (!user) redirect(`/${locale}/login?next=/${locale}/submissions`);

  const [rows, t] = await Promise.all([listMySubmissions(user.id), getTranslations("submission")]);

  const statusBadge = (s: string) => {
    if (s === "PUBLISHED") return <Badge>{t("statusPublished")}</Badge>;
    if (s === "REJECTED") return <Badge variant="secondary">{t("statusRejected")}</Badge>;
    return <Badge variant="outline">{t("statusPending")}</Badge>;
  };

  return (
    <main className="container max-w-3xl py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">{t("myList")}</h1>
        <Link href={`/${locale}/submit`} className="text-sm text-primary underline underline-offset-2">
          {t("title")}
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="min-w-0">
                {r.status === "PUBLISHED" ? (
                  <Link
                    href={`/${locale}/article/${r.slug}`}
                    className="truncate font-medium hover:text-primary"
                  >
                    {r.title}
                  </Link>
                ) : (
                  <span className="truncate font-medium">{r.title}</span>
                )}
                <div className="text-xs text-muted-foreground">
                  {r.category} · {new Date(r.createdAt).toLocaleDateString(locale)}
                </div>
              </div>
              {statusBadge(r.status)}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
