"use client";

import { useEffect, useRef } from "react";
import { activeThemeName } from "@/components/site/aurora-motion";

/**
 * 「酒的韵味」粒子(V4.6 勃艮第主题):金色酒珠气泡(杯中气泡/发酵,上升+摇摆) +
 * 酒香光雾(开瓶香气,慢飘光晕)。仅 burgundy 主题渲染,其他主题挂载点零影响。
 * 克制三保险:prefers-reduced-motion 不渲染;滚出视口自动暂停;DPR 自适应。
 * 鼠标轻斥交互(110px 半径柔和推开)。放置于 position:relative 的深色区块内。
 */

interface Bubble {
  x: number;
  y: number;
  r: number;
  v: number;
  sway: number;
  phase: number;
  a: number;
  gold: boolean;
}

interface Mote {
  x: number;
  y: number;
  r: number;
  v: number;
  a: number;
  phase: number;
}

export function WineFx() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (activeThemeName() !== "burgundy") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0;
    let H = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const mouse = { x: -9e3, y: -9e3 };
    const host = canvas.parentElement;
    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    };
    const onLeave = () => {
      mouse.x = -9e3;
      mouse.y = -9e3;
    };
    host?.addEventListener("mousemove", onMove);
    host?.addEventListener("mouseleave", onLeave);

    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    const makeBubble = (init: boolean): Bubble => ({
      x: rand(0, W),
      y: init ? rand(0, H) : H + rand(10, 70),
      r: rand(1, 3.6),
      v: rand(0.25, 0.85),
      sway: rand(0.4, 1.4),
      phase: rand(0, Math.PI * 2),
      a: rand(0.14, 0.5),
      gold: Math.random() < 0.75,
    });
    const stepBubble = (b: Bubble, t: number) => {
      b.y -= b.v;
      b.x += Math.sin(t * 0.001 * b.sway + b.phase) * 0.35;
      const dx = b.x - mouse.x;
      const dy = b.y - mouse.y;
      const d = Math.hypot(dx, dy);
      if (d < 110 && d > 0.1) {
        const f = ((110 - d) / 110) * 0.6;
        b.x += (dx / d) * f;
        b.y += (dy / d) * f;
      }
      if (b.y < -12) Object.assign(b, makeBubble(false));
    };
    const drawBubble = (b: Bubble) => {
      const c = b.gold ? "198,161,91" : "255,236,220";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${c},${b.a * 0.9})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${c},${b.a * 0.55})`;
      ctx.fill();
    };

    const makeMote = (init: boolean): Mote => ({
      x: rand(0, W),
      y: init ? rand(0, H) : H + rand(0, 90),
      r: rand(7, 20),
      v: rand(0.06, 0.22),
      a: rand(0.04, 0.1),
      phase: rand(0, Math.PI * 2),
    });
    const stepMote = (m: Mote, t: number) => {
      m.y -= m.v;
      m.x += Math.sin(t * 0.0004 + m.phase) * 0.18;
      if (m.y < -26) Object.assign(m, makeMote(false));
    };
    const drawMote = (m: Mote) => {
      const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r);
      g.addColorStop(0, `rgba(198,161,91,${m.a})`);
      g.addColorStop(1, "rgba(198,161,91,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    };

    const bubbles: Bubble[] = Array.from({ length: 54 }, () => makeBubble(true));
    const motes: Mote[] = Array.from({ length: 12 }, () => makeMote(true));

    let running = false;
    let raf = 0;
    const frame = (t: number) => {
      if (!running) return;
      ctx.clearRect(0, 0, W, H);
      motes.forEach((m) => {
        stepMote(m, t);
        drawMote(m);
      });
      bubbles.forEach((b) => {
        stepBubble(b, t);
        drawBubble(b);
      });
      raf = requestAnimationFrame(frame);
    };

    const io = new IntersectionObserver((es) => {
      es.forEach((e) => {
        if (e.isIntersecting && !running) {
          running = true;
          raf = requestAnimationFrame(frame);
        } else if (!e.isIntersecting && running) {
          running = false;
          cancelAnimationFrame(raf);
        }
      });
    });
    io.observe(canvas);
    running = true;
    raf = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("resize", resize);
      host?.removeEventListener("mousemove", onMove);
      host?.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return <canvas ref={ref} className="wine-fx" aria-hidden />;
}
