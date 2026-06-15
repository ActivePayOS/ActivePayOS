"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "neon";

// The theme is applied to <html data-theme> by an inline script in the root
// layout (before paint, to avoid a flash). This control reads that DOM state via
// useSyncExternalStore — no effects, no cascading renders — and toggles it.

function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  window.addEventListener("storage", callback);
  return () => {
    observer.disconnect();
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot(): Theme {
  return document.documentElement.getAttribute("data-theme") === "neon" ? "neon" : "light";
}

function getServerSnapshot(): Theme {
  return "light";
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isNeon = theme === "neon";

  function apply(next: Theme) {
    if (next === "neon") {
      document.documentElement.setAttribute("data-theme", "neon");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    try {
      localStorage.setItem("apo-theme", next);
    } catch {
      // ignore storage failures
    }
  }

  // Label/icon describe the theme you will switch TO.
  const target = isNeon ? "Light" : "Neon Noir";

  return (
    <button
      type="button"
      onClick={() => apply(isNeon ? "light" : "neon")}
      aria-label={`Switch to ${target} theme`}
      title={`Switch to ${target} theme`}
      suppressHydrationWarning
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium hover:text-[var(--brand-blue)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]"
    >
      <span aria-hidden suppressHydrationWarning>
        {isNeon ? "☀" : "🌃"}
      </span>
      <span suppressHydrationWarning>{target}</span>
    </button>
  );
}
