"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** 售后申请按钮(V4.2):弹窗填写原因,提交到 /api/my/refunds;成功后刷新订单列表 */
export function RefundRequestButton({ orderNo }: { orderNo: string }) {
  const t = useTranslations("shop");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const r = await fetch("/api/my/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNo, reason }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.message || "提交失败");
      toast.success(t("refundSubmitted"));
      setOpen(false);
      setReason("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "提交失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {t("refundRequest")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("refundRequest")}</DialogTitle>
            <DialogDescription>
              {orderNo} · {t("refundSubmitted")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              className="min-h-24"
              placeholder={t("refundReason")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button onClick={submit} disabled={busy || !reason.trim()}>
                {busy ? "…" : t("refundSubmit")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
