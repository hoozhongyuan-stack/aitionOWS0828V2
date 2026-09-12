"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * V3.1.1 极光主题动效层(仅 data-theme="aurora" 下启用):
 *  - Parallax:滚动视差包装(rAF 节流,速度系数 speed,0.3=背景以 0.3 倍速率反向位移)
 *  - Reveal:滚动显现包装(IntersectionObserver,进入视口一次性淡入上移)
 * 其他主题/偏好减弱动效的用户:原样渲染 children,零行为差异。
 */

/** 当前生效主题名(V4.4.0 起 data-theme 挂在前台布局容器,不再在 <html> 上) */
export function activeThemeName(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const el = document.querySelector("[data-theme]");
  return el?.getAttribute("data-theme") ?? undefined;
}

function auroraActive(): boolean {
  // V4.3:禾野(harvest)复用动效层(显现/视差);V4.2.1:窖藏(cellar)、V4.6:勃艮第(burgundy)同此。
  // 动画风格由各主题 CSS 段各自定义(本层只管"是否启用动效")
  // V4.6 修复:V4.4.0 把 data-theme 从 <html> 挪到前台容器后,此处仍读 documentElement,
  // 导致三主题的 Reveal/Parallax 自 V4.4.0 起失效——改读容器属性。
  const t = activeThemeName();
  return t === "aurora" || t === "harvest" || t === "cellar" || t === "burgundy";
}

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** 滚动视差包装层(speed 为位移速率,正值=随滚动上移) */
export function Parallax({
  children,
  speed = 0.3,
  className,
}: {
  children: ReactNode;
  /** 视差速率系数(0.2~0.5 推荐) */
  speed?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!auroraActive() || reducedMotion()) return;
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const rect = el.getBoundingClientRect();
        // 元素中心相对视口中心的偏移,乘速率作为视差位移
        const offset = (rect.top + rect.height / 2 - window.innerHeight / 2) * speed;
        el.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      el.style.transform = "";
    };
  }, [speed]);

  return (
    <div ref={ref} className={className} style={{ willChange: "transform" }}>
      {children}
    </div>
  );
}

/** 滚动显现包装层(进入视口一次性淡入上移) */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  /** 级联延迟(毫秒) */
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!auroraActive() || reducedMotion()) return;
    const el = ref.current;
    if (!el) return;
    el.classList.add("aurora-reveal");
    if (delay > 0) el.style.transitionDelay = `${delay}ms`;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add("aurora-revealed");
            io.disconnect();
          }
        }
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      el.classList.remove("aurora-reveal", "aurora-revealed");
      el.style.transitionDelay = "";
    };
  }, [delay]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
