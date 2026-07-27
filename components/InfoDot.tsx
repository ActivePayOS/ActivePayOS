"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

// The ⓘ popover from the Design Lab, promoted to a shared component: helper
// text stays out of the layout until asked for. Fully JS-driven so it works on
// touch screens too: hover opens it on desktop, a tap toggles it on mobile
// (iOS Safari never focuses a tapped button, so the old CSS-only
// group-focus-within approach silently did nothing on phones). The bubble is
// only rendered while open, so its 16rem box can never widen the page.
export default function InfoDot({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);

  // Close on tap/click anywhere else and on Escape.
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

  // Keep the bubble on screen: measure after it renders and nudge it inward.
  // Writes the transform straight to the DOM node (measurement + style are a
  // DOM concern, so no state round-trip is needed).
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
    <span
      ref={rootRef}
      className={`relative inline-flex align-middle ${className}`}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") setOpen(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label={text}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 text-[10px] font-semibold leading-none text-gray-400 transition hover:border-gray-500 hover:text-gray-700"
      >
        i
      </button>
      {open && (
        <span
          ref={bubbleRef}
          role="tooltip"
          style={{ transform: "translateX(-50%)" }}
          className="absolute left-1/2 top-full z-30 mt-2 w-72 max-w-[min(18rem,calc(100vw-2rem))] whitespace-pre-line rounded-xl bg-slate-900 px-3 py-2 text-left text-[11px] font-normal normal-case leading-4 tracking-normal text-slate-100 shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}
