"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export interface HeroBanner {
  imageUrl: string;
  linkUrl: string | null;
}

/**
 * 首页顶部通屏轮播图背景(新增需求①)。
 * 纯背景层(绝对定位铺满父级 Hero 区域):自动轮播(5s)+ 底部圆点手动切换;
 * 主标题/副标题/按钮由首页在其上叠加一层文案(z-10),文案本身仍来自
 * next-intl(可在「语言 → 界面文案覆盖」按语言自定义,namespace=site)。
 */
export function HeroCarousel({ banners }: { banners: HeroBanner[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % banners.length), 5000);
    return () => clearInterval(timer);
  }, [banners.length]);

  if (banners.length === 0) return null;

  return (
    <div className="absolute inset-0 overflow-hidden bg-secondary">
      {banners.map((b, i) => {
        const img = (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.imageUrl} alt="" className="h-full w-full object-cover" />
        );
        return (
          <div
            key={i}
            className={`absolute inset-0 transition-opacity duration-700 ${
              i === index ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
            aria-hidden={i !== index}
          >
            {b.linkUrl ? (
              <Link
                href={b.linkUrl}
                className="block h-full w-full"
                target={b.linkUrl.startsWith("http") ? "_blank" : undefined}
              >
                {img}
              </Link>
            ) : (
              img
            )}
          </div>
        );
      })}
      {/* 蒙层:保证叠加文字在任意图片上都可读 */}
      <div className="absolute inset-0 bg-black/35" />
      {banners.length > 1 && (
        <div className="absolute inset-x-0 bottom-4 z-10 flex justify-center gap-1.5">
          {banners.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`第 ${i + 1} 张`}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-6 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
