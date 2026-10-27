import { useId } from "react";

import { MARK_CELLS, MARK_VIEWBOX } from "@/lib/mark";

export function Mark({ size = 24, className }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg className={className} viewBox={MARK_VIEWBOX} width={size} height={size} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8ef0f7" />
          <stop offset="1" stopColor="#b9a6ff" />
        </linearGradient>
      </defs>
      <g fill={`url(#${id})`}>
        {MARK_CELLS.map((c) => <rect key={`${c.x}:${c.y}`} x={c.x} y={c.y} width={c.size} height={c.size} rx={0.35} opacity={c.opacity < 1 ? c.opacity : undefined} />)}
      </g>
    </svg>
  );
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <Mark size={size} />
      <span style={{ fontSize: 17, fontWeight: 500, letterSpacing: "-.025em" }}>hoodiebot</span>
    </span>
  );
}
