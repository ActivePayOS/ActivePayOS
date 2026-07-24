"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

const ORDER: Theme[] = ["light", "dark"];
const META: Record<Theme, { label: string; icon: string }> = {
  light: { label: "Light", icon: "☀" },
  dark: { label: "Dark", icon: "🌙" },
};

// The theme is applied to <html data-theme> by the server (default) and an
// inline script in the root layout (before paint, to avoid a flash). This
// control reads that DOM state via useSyncExternalStore — no effects — and
// cycles through the themes.

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
  const t = document.documentElement.getAttribute("data-theme");
  return t === "dark" ? "dark" : "light";
}

function getServerSnapshot(): Theme {
  return "light";
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function apply(next: Theme) {
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("apo-theme", next);
    } catch {
      // ignore storage failures
    }
  }

  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
  const meta = META[theme];

  return (
    <button
      type="button"
      onClick={() => apply(next)}
      aria-label={`Theme: ${meta.label}. Switch to ${META[next].label}.`}
      title={`Theme: ${meta.label} — click for ${META[next].label}`}
      suppressHydrationWarning
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium hover:text-[var(--brand-blue)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]"
    >
      <span aria-hidden suppressHydrationWarning>
        {meta.icon}
      </span>
      <span suppressHydrationWarning>{meta.label}</span>
    </button>
  );
}
