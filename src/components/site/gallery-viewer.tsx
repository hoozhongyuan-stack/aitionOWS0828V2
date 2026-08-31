"use client";

import { useState } from "react";

/**
 * 商品图集查看器(V3.0 DEF-010):主图 + 缩略图点击切换,零第三方依赖。
 * 服务端渲染输出全部图片(禁 JS 可见,NFR-002 不回退);切换为纯客户端 state。
 */
export function GalleryViewer({
  images,
  alt,
}: {
  images: { url: string; alt?: string }[];
  alt: string;
}) {
  const [active, setActive] = useState(0);
  const main = images[active] ?? images[0];
  if (!main) return null;

  return (
    <div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={main.url}
        alt={main.alt || alt}
        className="aspect-[4/3] w-full rounded-xl border bg-muted object-cover"
      />
      {images.length > 1 && (
        <div className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-5">
          {images.map((g, i) => (
            <button
              key={`${g.url}-${i}`}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`查看第 ${i + 1} 张`}
              aria-current={i === active}
              className={`overflow-hidden rounded-lg border-2 transition-colors ${
                i === active ? "border-primary" : "border-transparent hover:border-muted-foreground/30"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={g.url}
                alt={`${alt} ${i + 1}`}
                loading="lazy"
                className="aspect-square w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
