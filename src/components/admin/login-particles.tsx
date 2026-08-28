"use client";

import { useEffect, useRef } from "react";

/**
 * 登录页背景粒子:节点漂移 + 近距连线(科幻网络感)。
 * 纯 Canvas 实现,零依赖;对 pointer 事件透明,不阻挡表单交互。
 */
export function LoginParticles() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 尊重系统"减弱动态效果"偏好(晕动用户)
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const COUNT = 70; // 粒子数量
    const LINK_DIST = 140; // 两点距离小于该值时连线
    const COLOR = "56,189,248"; // cyan-400

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let raf = 0;

    type P = { x: number; y: number; vx: number; vy: number };
    let pts: P[] = [];

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pts = Array.from({ length: COUNT }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
      }));
    };

    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of pts) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${COLOR},0.85)`;
        ctx.fill();
      }
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
          if (d >= LINK_DIST) continue;
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.strokeStyle = `rgba(${COLOR},${((1 - d / LINK_DIST) * 0.35).toFixed(3)})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      raf = requestAnimationFrame(tick);
    };

    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(tick);

    // 清理:组件卸载必须停帧 + 摘监听,防止泄漏
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // pointer-events-none 是命门:否则画布会拦截登录表单的点击
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" />;
}
