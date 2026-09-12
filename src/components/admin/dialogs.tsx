"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * 全后台统一弹窗系统(V4.6.2):Promise 风格 confirmDialog/promptDialog,
 * 替代 window.confirm/prompt(原生弹窗样式不可控/顶部弹出)。
 * 由 <AdminDialogHost /> 挂载于后台布局;调用方 `await confirmDialog({...})`。
 * PromptOptions.select 提供时渲染下拉(如移动分组选择已有文件夹)。
 */

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  /** 危险操作:确认钮红色(删除/取消类) */
  destructive?: boolean;
}

export interface PromptSelectOption {
  value: string;
  label: string;
}

export interface PromptOptions {
  title: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  /** 提供时渲染下拉选择(值+显示名),否则渲染文本输入 */
  select?: PromptSelectOption[];
  confirmLabel?: string;
}

type Request =
  | ({ kind: "confirm" } & ConfirmOptions & { resolve: (v: boolean) => void })
  | ({ kind: "prompt" } & PromptOptions & { resolve: (v: string | null) => void });

let push: ((r: Request) => void) | null = null;

/** 确认弹窗(替代 window.confirm);resolve=true 确认 */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    push?.({ kind: "confirm", ...opts, resolve });
  });
}

/** 输入/选择弹窗(替代 window.prompt);取消返回 null */
export function promptDialog(opts: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    push?.({ kind: "prompt", ...opts, resolve });
  });
}

/** 弹窗宿主:挂于后台布局一次,全局可用 */
export function AdminDialogHost() {
  const [req, setReq] = useState<Request | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    push = (r: Request) => {
      setReq(r);
      setValue(typeof (r as { defaultValue?: string }).defaultValue === "string" ? (r as { defaultValue: string }).defaultValue : "");
    };
    return () => {
      push = null;
    };
  }, []);

  function close(v: string | boolean | null) {
    if (!req) return;
    if (req.kind === "confirm") (req.resolve as (v: boolean) => void)(v === true);
    else (req.resolve as (v: string | null) => void)(typeof v === "string" ? v : null);
    setReq(null);
    setBusy(false);
  }

  const isDanger = req?.kind === "confirm" && (req as ConfirmOptions & { kind: string }).destructive;

  return (
    <Dialog open={!!req} onOpenChange={(v) => !v && close(null)}>
      <DialogContent className="sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
        {req && (
          <>
            <DialogHeader>
              <DialogTitle>{req.title}</DialogTitle>
              {req.kind === "confirm" && req.description ? (
                <DialogDescription>{req.description}</DialogDescription>
              ) : req.kind === "prompt" ? (
                <DialogDescription>{(req as PromptOptions & { kind: string }).label ?? ""}</DialogDescription>
              ) : null}
            </DialogHeader>
            {req.kind === "prompt" && (
              <div className="py-1">
                {(() => {
                  const po = req as Request & PromptOptions;
                  if (po.select) {
                    return (
                      <select
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        autoFocus
                      >
                        {po.select.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    );
                  }
                  return (
                    <Input
                      value={value}
                      placeholder={po.placeholder}
                      onChange={(e) => setValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !busy) {
                          e.preventDefault();
                          setBusy(true);
                          close(value);
                        }
                      }}
                      autoFocus
                    />
                  );
                })()}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => close(null)}>
                取消
              </Button>
              <Button
                variant={isDanger ? "destructive" : "default"}
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  close(req.kind === "confirm" ? true : value);
                }}
              >
                {req.kind === "confirm"
                  ? (req as ConfirmOptions).confirmLabel ?? "确定"
                  : (req as PromptOptions).confirmLabel ?? "确定"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
