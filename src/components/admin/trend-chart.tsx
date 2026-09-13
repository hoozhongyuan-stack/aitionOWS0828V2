"use client";

import { useState } from "react";

/**
 * 访问趋势图(V4.6.4 升级):SVG 面积 + 折线,带 Y 轴刻度与网格线、hover 十字定位数值浮层。
 * 自研零依赖;整体 select-none 防止拖动选中文字;数据点 ≤14 天时常显数值。
 */

export interface TrendPoint {
  date: string;
  pv: number;
  uv: number;
}

const W = 760; // SVG 逻辑宽度(外层横向滚动可容纳更长区间)
const H = 200;
const PAD = { top: 16, right: 16, bottom: 28, left: 40 };

function niceMax(v: number): number {
  if (v <= 0) return 10;
  const mag = 10 ** Math.floor(Math.log10(v));
  const n = Math.ceil(v / mag);
  return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">该区间暂无数据</p>;
  }

  // 单点时避免除零:把横轴按 2 个刻度处理
  const n = data.length;
  const stepX = n > 1 ? (W - PAD.left - PAD.right) / (n - 1) : 0;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n > 1 ? i * stepX : plotW / 2);
  const maxV = niceMax(Math.max(...data.map((d) => Math.max(d.pv, d.uv)), 1));
  const y = (v: number) => PAD.top + plotH - (v / maxV) * plotH;

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.pv)}`).join(" ");
  const area = `${line} L${x(n - 1)},${PAD.top + plotH} L${x(0)},${PAD.top + plotH} Z`;
  const ticks = [0, maxV / 2, maxV];
  const showLabels = n <= 14;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    if (n === 1) return setHover(0);
    const idx = Math.round((px - PAD.left) / stepX);
    setHover(Math.max(0, Math.min(n - 1, idx)));
  }

  const hp = hover != null ? data[hover] : null;

  return (
    <div className="select-none overflow-x-auto" onMouseLeave={() => setHover(null)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-52 min-w-[640px] w-full"
        onMouseMove={onMove}
        role="img"
        aria-label="访问趋势图"
      >
        <defs>
          <linearGradient id="pvArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.28" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Y 轴刻度 + 网格线 */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke="currentColor"
              strokeOpacity="0.12"
              strokeDasharray="3 3"
            />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
              {Math.round(t)}
            </text>
          </g>
        ))}

        {/* PV 面积 + 折线 */}
        <path d={area} fill="url(#pvArea)" />
        <path d={line} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinejoin="round" />

        {/* UV 折线(虚线,便于与 PV 区分) */}
        <path
          d={data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.uv)}`).join(" ")}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeOpacity="0.45"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />

        {/* 数据点 + 常显数值(≤14 天) */}
        {data.map((d, i) => (
          <g key={d.date}>
            <circle cx={x(i)} cy={y(d.pv)} r={hover === i ? 4 : 2.5} fill="hsl(var(--primary))" />
            {showLabels && (
              <text x={x(i)} y={y(d.pv) - 7} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                {d.pv}
              </text>
            )}
            <text
              x={x(i)}
              y={H - 8}
              textAnchor="middle"
              className="fill-muted-foreground text-[9px]"
            >
              {d.date.slice(5)}
            </text>
          </g>
        ))}

        {/* hover 十字定位 + 浮层 */}
        {hp && hover != null && (
          <g>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke="currentColor"
              strokeOpacity="0.25"
            />
            <rect
              x={Math.min(Math.max(x(hover) - 52, 2), W - 106)}
              y={PAD.top - 4}
              width="104"
              height="34"
              rx="6"
              className="fill-popover"
              stroke="currentColor"
              strokeOpacity="0.15"
            />
            <text
              x={Math.min(Math.max(x(hover) - 52, 2), W - 106) + 8}
              y={PAD.top + 10}
              className="fill-foreground text-[10px]"
            >
              {hp.date}
            </text>
            <text
              x={Math.min(Math.max(x(hover) - 52, 2), W - 106) + 8}
              y={PAD.top + 24}
              className="fill-muted-foreground text-[10px]"
            >
              PV {hp.pv} · UV {hp.uv}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
