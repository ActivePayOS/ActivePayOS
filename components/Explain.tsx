"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

// A number or term with an explanation. Renders a dotted underline and help
// cursor so it's discoverable. Desktop keeps the native title tooltip on
// hover; on touch screens (where title tooltips never show) a tap opens the
// same text as a popover bubble, so the explanations actually work on phones.
export default function Explain({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Nudge the bubble inward so it never runs off the viewport edge. Writes
  // the transform straight to the DOM node — no state round-trip.
  useLayoutEffect(() => {
    if (!open) return;
    const el = bubbleRef.current;
    if (!el) return;
    el.style.transform = "translateX(-50%)";
    const r = el.getBoundingClientRect();
    const pad = 8;
    let dx = 0;
    if (r.left < pad) dx = pad - r.left;
    else if (r.right > window.innerWidth - pad) dx = window.innerWidth - pad - r.right;
    if (dx !== 0) el.style.transform = `translateX(calc(-50% + ${dx}px))`;
  }, [open]);

  return (
    <span ref={rootRef} className="relative inline-flex max-w-full">
      <span
        title={title}
        aria-label={title}
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        className={`cursor-help underline decoration-dotted decoration-gray-400 underline-offset-4 ${className}`}
      >
        {children}
      </span>
      {open && (
        <span
          ref={bubbleRef}
          role="tooltip"
          style={{ transform: "translateX(-50%)" }}
          className="absolute left-1/2 top-full z-30 mt-2 w-64 max-w-[min(16rem,calc(100vw-2rem))] rounded-xl bg-slate-900 px-3 py-2 text-left text-[11px] font-normal normal-case leading-4 tracking-normal text-slate-100 shadow-lg"
        >
          {title}
        </span>
      )}
    </span>
  );
}
