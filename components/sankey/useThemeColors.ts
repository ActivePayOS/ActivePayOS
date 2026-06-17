"use client";

import { useSyncExternalStore } from "react";

// Reads the active theme's CSS variables into concrete hex values so the
// Sankey can paint (and export) without relying on the stylesheet. Reacts to
// theme switches the same way ThemeToggle does — by observing
// <html data-theme> via useSyncExternalStore (no effects, no cascading state).

export type ThemeColors = {
  foreground: string;
  muted: string;
  line: string;
  card: string;
  cardMuted: string;
  brandBlue: string;
};

// Matches the light theme defaults in globals.css (the app's default theme),
// used for SSR / first paint before the real values are read on the client.
const FALLBACK: ThemeColors = {
  foreground: "#07183b",
  muted: "#526176",
  line: "#d8e0ec",
  card: "#ffffff",
  cardMuted: "#f1f5f9",
  brandBlue: "#0b5cff",
};

// useSyncExternalStore requires getSnapshot to return a referentially stable
// value when nothing changed, so we cache and only mint a new object when a
// color actually differs.
let cache: ThemeColors = FALLBACK;

function readThemeColors(): ThemeColors {
  if (typeof window === "undefined") return FALLBACK;
  const style = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) => {
    const v = style.getPropertyValue(name).trim();
    return v || fallback;
  };
  const next: ThemeColors = {
    foreground: get("--foreground", FALLBACK.foreground),
    muted: get("--muted", FALLBACK.muted),
    line: get("--line", FALLBACK.line),
    card: get("--card", FALLBACK.card),
    cardMuted: get("--card-muted", FALLBACK.cardMuted),
    brandBlue: get("--brand-blue", FALLBACK.brandBlue),
  };
  if (
    cache.foreground === next.foreground &&
    cache.muted === next.muted &&
    cache.line === next.line &&
    cache.card === next.card &&
    cache.cardMuted === next.cardMuted &&
    cache.brandBlue === next.brandBlue
  ) {
    return cache;
  }
  cache = next;
  return next;
}

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

export function useThemeColors(): ThemeColors {
  return useSyncExternalStore(subscribe, readThemeColors, () => FALLBACK);
}
