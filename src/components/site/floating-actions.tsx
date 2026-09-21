"use client";

import { useCallback, useEffect, useState } from "react";
import { X, MessageSquare } from "lucide-react";
import { FormRenderer } from "@/components/site/form-renderer";
import type { FormField } from "@/types/form";
import type { FloatingItem } from "@/lib/floating";
import { cn } from "@/lib/utils";

/**
 * 右侧悬浮入口(V4.8.3)—— 后台「品牌信息 → 悬浮入口」配置,最多 2 条。
 *
 * 交互:
 * - 桌面(right, 垂直居中):图标竖排,悬停显示文字提示;tel 项是原生 <a href="tel:">,
 *   移动端点按直接拉起拨号盘(不用 JS,避免被拦截);
 * - 手机(右下角圆形按钮):点一下展开两条,再点收起 —— 避免竖条遮挡正文;
 * - form 项:点击在当前页弹层里加载表单并就地提交(不跳页);
 * - qrcode 项:点击弹层展示大图(加微信场景)。
 *
 * 弹层:点击遮罩或按 Esc 关闭;form 弹层的数据来自 GET /api/form/[slug](仅启用中的表单)。
 */
export function FloatingActions({
  items,
  labels,
}: {
  items: FloatingItem[];
  labels: { open: string; close: string; loading: string; loadFailed: string };
}) {
  const [openItem, setOpenItem] = useState<FloatingItem | null>(null);
  const [expanded, setExpanded] = useState(false);
  const close = useCallback(() => setOpenItem(null), []);

  // Esc 关闭弹层(无障碍:键盘用户也能退出)
  useEffect(() => {
    if (!openItem) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openItem, close]);

  if (items.length === 0) return null;

  const buttonClass =
    "group flex h-11 w-11 items-center justify-center rounded-lg border bg-background/95 text-foreground shadow-sm transition-colors hover:border-primary hover:text-primary";

  return (
    <>
      {/* 桌面:右侧竖排 */}
      <div
        className="fixed right-0 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-1 rounded-l-xl border border-r-0 bg-background/90 p-1.5 shadow-lg backdrop-blur md:flex"
        aria-label={labels.open}
      >
        {items.map((item) => (
          <EntryButton key={item.key} item={item} className={buttonClass} onOpen={setOpenItem} />
        ))}
      </div>

      {/* 手机:右下角圆钮 → 展开 */}
      <div className="fixed bottom-5 right-4 z-40 flex flex-col items-end gap-2 md:hidden">
        {expanded && (
          <div className="flex flex-col items-end gap-2">
            {items.map((item) => (
              <div key={item.key} className="flex items-center gap-2">
                {item.label && (
                  <span className="rounded-full bg-foreground/85 px-2.5 py-1 text-xs text-background shadow">
                    {item.label}
                  </span>
                )}
                <EntryButton item={item} className={buttonClass} onOpen={setOpenItem} />
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={labels.open}
          className="flex h-12 w-12 items-center justify-center rounded-full border border-primary/40 bg-background text-primary shadow-lg transition-transform active:scale-95"
        >
          {expanded ? <X className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
        </button>
      </div>

      {openItem && <EntryModal item={openItem} labels={labels} onClose={close} />}
    </>
  );
}

/** 单个入口:tel 用原生链接,form/qrcode 打开弹层 */
function EntryButton({
  item,
  className,
  onOpen,
}: {
  item: FloatingItem;
  className: string;
  onOpen: (item: FloatingItem) => void;
}) {
  const inner = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.iconUrl} alt="" className="h-6 w-6 object-contain" />
  );
  const title = item.label || undefined;
  if (item.type === "tel" && item.href) {
    return (
      <a href={item.href} title={title} aria-label={item.label || item.href} className={className}>
        {inner}
      </a>
    );
  }
  return (
    <button
      type="button"
      title={title}
      aria-label={item.label || item.type}
      onClick={() => onOpen(item)}
      className={className}
    >
      {inner}
    </button>
  );
}

/** 弹层外壳:遮罩点击关闭、内容点击不冒泡 */
function ModalShell({
  onClose,
  labels,
  children,
  wide,
}: {
  onClose: () => void;
  labels: { close: string };
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className={cn(
          "relative max-h-[85vh] overflow-y-auto rounded-xl border bg-background p-5 shadow-2xl",
          wide ? "w-full max-w-lg" : "w-fit"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={labels.close}
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

function EntryModal({
  item,
  labels,
  onClose,
}: {
  item: FloatingItem;
  labels: { close: string; loading: string; loadFailed: string };
  onClose: () => void;
}) {
  if (item.type === "qrcode") {
    return (
      <ModalShell onClose={onClose} labels={labels}>
        <div className="flex flex-col items-center gap-3 pt-4">
          {item.label && <div className="text-sm font-medium">{item.label}</div>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.qrcodeUrl}
            alt={item.label || "二维码"}
            className="h-auto w-[min(70vw,320px)] rounded-lg border object-contain"
          />
        </div>
      </ModalShell>
    );
  }

  if (item.type === "form" && item.form) {
    return (
      <ModalShell onClose={onClose} labels={labels} wide>
        <FormInModal slug={item.form.slug} title={item.form.name} labels={labels} />
      </ModalShell>
    );
  }

  return null;
}

/** 弹层内加载并渲染表单:字段定义来自公开接口(仅启用中的表单) */
function FormInModal({
  slug,
  title,
  labels,
}: {
  slug: string;
  title: string;
  labels: { loading: string; loadFailed: string };
}) {
  const [fields, setFields] = useState<FormField[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/form/${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d?.ok && Array.isArray(d.data?.fields)) setFields(d.data.fields as FormField[]);
        else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [slug]);

  return (
    <div className="space-y-3 pt-1">
      {failed ? (
        <p className="text-sm text-muted-foreground">{labels.loadFailed}</p>
      ) : fields === null ? (
        <p className="text-sm text-muted-foreground">{labels.loading}</p>
      ) : (
        <FormRenderer slug={slug} title={title} fields={fields} />
      )}
    </div>
  );
}
