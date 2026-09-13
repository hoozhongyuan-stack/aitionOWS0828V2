"use client";

import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 后台统一下拉选择器(V4.6.5)。
 *
 * 为什么不用原生 <select>:原生下拉的展开面板由浏览器渲染,样式无法与后台一致
 * (截图反馈的「古朴」感即来源于此),且无法搜索。为什么不用 Radix Select:
 * 后台筛选器普遍用空字符串表达「全部」,而 Radix 的 SelectItem 不接受 value="",
 * 逐处改哨兵值会引入回归面。故这里自研一个轻量实现:
 * - 触发按钮 + 浮层面板,视觉与 shadcn 体系一致(与前台主题变量共用 --popover 等)
 * - 键盘可达:↑/↓ 移动、Enter 选中、Esc 关闭、Home/End 首尾
 * - 选项较多时自动出现搜索框(默认 >12 项),不用再靠肉眼在长名单里找
 * - 空字符串是一等公民,直接写 { value: "", label: "全部栏目" } 即可
 */

export interface AdminSelectOption {
  value: string;
  label: string;
}

export interface AdminSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: AdminSelectOption[];
  /** value 在 options 中找不到时的占位文案 */
  placeholder?: string;
  /** 选项数超过该值时启用搜索框(默认 12;传 0 强制启用) */
  searchThreshold?: number;
  /** sm:筛选栏用(h-8) | md:表单/弹窗用(h-9) */
  size?: "sm" | "md";
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  emptyText?: string;
  "aria-label"?: string;
}

export function AdminSelect({
  value,
  onChange,
  options,
  placeholder = "请选择",
  searchThreshold = 12,
  size = "md",
  className,
  disabled,
  autoFocus,
  emptyText = "无匹配项",
  "aria-label": ariaLabel,
}: AdminSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [keyword, setKeyword] = React.useState("");
  const [active, setActive] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listboxId = React.useId();
  const searchRef = React.useRef<HTMLInputElement>(null);

  const searchable = options.length > searchThreshold;
  const selected = options.find((o) => o.value === value);
  const filtered = React.useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return options;
    return options.filter((o) => o.label.toLowerCase().includes(kw));
  }, [options, keyword]);

  // 关闭时重置搜索词,避免下次打开带着上次的关键字
  function close() {
    setOpen(false);
    setKeyword("");
  }

  function openPanel() {
    if (disabled) return;
    const idx = options.findIndex((o) => o.value === value);
    setActive(idx < 0 ? 0 : idx);
    setOpen(true);
  }

  function pick(opt: AdminSelectOption) {
    onChange(opt.value);
    close();
  }

  // 点击外部/Esc 关闭
  React.useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      setKeyword("");
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  React.useEffect(() => {
    if (open && searchable) searchRef.current?.focus();
  }, [open, searchable]);

  // 高亮项始终可见
  React.useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, active, filtered.length]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        openPanel();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "Tab") {
      close();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[active];
      if (opt) pick(opt);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (filtered.length === 0) return;
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + delta + filtered.length) % filtered.length);
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActive(e.key === "Home" ? 0 : Math.max(0, filtered.length - 1));
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)} onKeyDown={onKeyDown}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        disabled={disabled}
        autoFocus={autoFocus}
        onClick={() => (open ? close() : openPanel())}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md border border-input bg-background text-left transition-colors hover:bg-accent/40 focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          size === "sm" ? "h-8 px-2.5 text-sm" : "h-9 px-3 text-sm"
        )}
      >
        <span
          className={cn("min-w-0 flex-1 truncate", !selected && "text-muted-foreground")}
          title={selected ? selected.label : placeholder}
        >
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 flex-none opacity-50 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-max min-w-full max-w-80 rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          {searchable && (
            <div className="relative mb-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchRef}
                value={keyword}
                onChange={(e) => {
                  setKeyword(e.target.value);
                  setActive(0);
                }}
                placeholder="搜索…"
                className="h-8 w-full rounded-sm border border-input bg-background pl-7 pr-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          )}
          <ul id={listboxId} role="listbox" className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-2 py-3 text-center text-sm text-muted-foreground">{emptyText}</li>
            ) : (
              filtered.map((o, i) => (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={o.value === value}
                    data-active={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(o)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                      i === active && "bg-accent text-accent-foreground"
                    )}
                  >
                    <Check
                      className={cn(
                        "h-3.5 w-3.5 flex-none",
                        o.value === value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate" title={o.label}>
                      {o.label}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
