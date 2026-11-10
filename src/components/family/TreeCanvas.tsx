import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Locate, Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CARD_H, CARD_W, computeLayout } from "@/lib/tree-layout";
import { fullName, lifeSpan, type TreeIndex } from "@/lib/relations";
import type { Person } from "@/lib/family-data";
import { cn } from "@/lib/utils";
import { PersonAvatar } from "./PersonAvatar";

const sexBorder: Record<string, string> = {
  M: "border-l-male",
  F: "border-l-female",
  U: "border-l-unknown",
};

interface View {
  x: number;
  y: number;
  k: number;
}

export function TreeCanvas({
  idx,
  focusId,
  onFocus,
  photoUrls,
}: {
  idx: TreeIndex<Person>;
  focusId: string;
  onFocus: (id: string) => void;
  photoUrls: Record<string, string>;
}) {
  const layout = useMemo(() => computeLayout(idx, focusId), [idx, focusId]);
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [animate, setAnimate] = useState(true);
  const drag = useRef<{ id: number; sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null);

  const centre = useCallback((k?: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setAnimate(true);
    setView((v) => {
      const kk = k ?? v.k;
      return { k: kk, x: r.width / 2, y: r.height / 2 - (CARD_H / 2) * kk };
    });
  }, []);

  // Re-centre whenever the focus person changes
  useEffect(() => {
    centre();
  }, [focusId, centre]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => centre());
    ro.observe(el);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const cx = e.clientX - r.left;
      const cy = e.clientY - r.top;
      setAnimate(false);
      setView((v) => {
        const k = Math.min(2, Math.max(0.25, v.k * Math.exp(-e.deltaY * 0.0015)));
        return { k, x: cx - (cx - v.x) * (k / v.k), y: cy - (cy - v.y) * (k / v.k) };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", onWheel);
    };
  }, [centre]);

  const zoomBy = (f: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.width / 2;
    const cy = r.height / 2;
    setAnimate(true);
    setView((v) => {
      const k = Math.min(2, Math.max(0.25, v.k * f));
      return { k, x: cx - (cx - v.x) * (k / v.k), y: cy - (cy - v.y) * (k / v.k) };
    });
  };

  return (
    <div
      ref={ref}
      className="relative h-full w-full cursor-grab touch-none select-none overflow-hidden bg-dots active:cursor-grabbing"
      onPointerDown={(e) => {
        drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        const dx = e.clientX - d.sx;
        const dy = e.clientY - d.sy;
        if (!d.moved && Math.hypot(dx, dy) > 4) {
          d.moved = true;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setAnimate(false);
        }
        if (d.moved) setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
      }}
      onPointerUp={() => {
        setTimeout(() => (drag.current = null), 0);
      }}
      onClickCapture={(e) => {
        if (drag.current?.moved) {
          e.stopPropagation();
          e.preventDefault();
        }
      }}
    >
      <div
        className={cn("absolute left-0 top-0 origin-top-left", animate && "transition-transform duration-500 ease-out")}
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
      >
        <svg
          key={focusId}
          className="pointer-events-none absolute left-0 top-0 animate-in fade-in duration-700"
          width="1"
          height="1"
          style={{ overflow: "visible" }}
          aria-hidden="true"
        >
          {layout.edges.map((d, i) => (
            <path key={i} d={d} fill="none" className="stroke-line" strokeWidth={1.5} strokeLinecap="round" />
          ))}
        </svg>

        {layout.nodes.map((n) => {
          const p = idx.personById.get(n.personId)!;
          const isFocus = n.role === "focus";
          return (
            <button
              key={n.key}
              type="button"
              onClick={() => onFocus(n.personId)}
              className={cn(
                "absolute flex items-center gap-3 rounded-lg border border-l-4 border-border bg-card px-3 text-left shadow-card transition-[left,top,box-shadow] duration-500 ease-out hover:ring-2 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                sexBorder[p.sex] ?? sexBorder["U"],
                isFocus && "ring-2 ring-primary",
              )}
              style={{ left: n.x - CARD_W / 2, top: n.y, width: CARD_W, height: CARD_H }}
            >
              <PersonAvatar person={p} url={p.photo_path ? photoUrls[p.photo_path] : null} className="h-11 w-11 text-sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-card-foreground">{fullName(p)}</span>
                <span className="block truncate text-xs text-muted-foreground">{lifeSpan(p) || "\u00a0"}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="absolute bottom-4 left-4 flex flex-col gap-1.5 rounded-lg border border-border bg-card/90 p-1 shadow-card backdrop-blur">
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => zoomBy(1.2)} aria-label="Zoom in">
          <Plus className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out">
          <Minus className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => centre(1)} aria-label="Re-centre">
          <Locate className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
