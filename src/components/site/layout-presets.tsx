"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * V3.2 布局预设变体:列表式最新动态条目(hero-list 预设用)。
 * 横向条目:封面小图 + 标题/摘要 + 日期,与 ContentCard 数据同构。
 */
export interface ListItem {
  slug: string;
  title: string;
  summary: string | null;
  coverUrl: string | null;
  publishedAt: Date | string;
  href: string;
}

export function ListItemRow({ item, dateLabel }: { item: ListItem; dateLabel: string }) {
  const date = new Date(item.publishedAt);
  return (
    <Link
      href={item.href}
      className="group flex items-center gap-4 rounded-xl border bg-card p-4 transition-shadow hover:shadow-md"
    >
      {item.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.coverUrl}
          alt={item.title}
          className="h-16 w-24 shrink-0 rounded-lg object-cover"
        />
      )}
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-medium group-hover:text-primary">{item.title}</h3>
        {item.summary && <p className="truncate text-sm text-muted-foreground">{item.summary}</p>}
      </div>
      <time dateTime={date.toISOString()} className="shrink-0 text-xs text-muted-foreground">
        {date.toLocaleDateString()}
        <span className="sr-only">{dateLabel}</span>
      </time>
    </Link>
  );
}

/** V3.2 布局预设:客户端开关式 CTA 横幅(hero-list 预设尾部) */
export function CtaBanner({ text, href, label }: { text: string; href: string; label: string }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <section className="container pb-16">
      <div className="flex flex-col items-center justify-between gap-4 rounded-xl border bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-8 sm:flex-row">
        <p className="text-lg font-medium">{text}</p>
        <Button asChild>
          <Link href={href}>
            {label}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

import { Button } from "@/components/ui/button";
