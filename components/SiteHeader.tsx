"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import ThemeToggle from "@/components/ThemeToggle";

// Site-wide navigation. One source of truth for the IA:
//  - the money tools stay one click away (Pay, Budget, Wealth Projector)
//  - planning surfaces group under "Plan" so the ribbon stays uncluttered
//  - active section is highlighted; mobile gets a proper disclosure menu.

type NavLink = { href: string; label: string; description?: string };

const PRIMARY: NavLink[] = [
  { href: "/", label: "Pay" },
  { href: "/budget", label: "Budget" },
  { href: "/toolkits/wealth-projector", label: "Wealth Projector" },
];

const PLAN_GROUP: NavLink[] = [
  {
    href: "/toolkits/promotion-timeline",
    label: "Career Timeline",
    description: "Promotions, ETS, and pay milestones over a career",
  },
  {
    href: "/housing",
    label: "Housing",
    description: "BAH decisions, affordability, rent vs. buy",
  },
  {
    href: "/pcs",
    label: "PCS",
    description: "Plan a move — DLA, per diem, and checklists",
  },
];

const SECONDARY: NavLink[] = [
  { href: "/toolkits", label: "Toolkits" },
  { href: "/about", label: "About" },
];

function useIsActive() {
  const pathname = usePathname() ?? "/";
  return (href: string) => {
    if (href === "/") return pathname === "/" || pathname.startsWith("/pay");
    if (href === "/toolkits") {
      // The two toolkit pages promoted into the ribbon shouldn't light up
      // the generic Toolkits entry too.
      return (
        pathname.startsWith("/toolkits") &&
        !pathname.startsWith("/toolkits/wealth-projector") &&
        !pathname.startsWith("/toolkits/promotion-timeline")
      );
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };
}

function desktopLinkCls(active: boolean) {
  return `rounded-full px-3 py-1.5 transition ${
    active
      ? "bg-[var(--field-bg)] font-semibold text-[var(--field-text)]"
      : "text-gray-700 hover:text-[var(--brand-blue)]"
  }`;
}

export default function SiteHeader() {
  const isActive = useIsActive();
  const pathname = usePathname();
  const [planOpen, setPlanOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const planRef = useRef<HTMLDivElement>(null);

  // Close menus on navigation (state reset during render, per React guidance).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (planOpen) setPlanOpen(false);
    if (mobileOpen) setMobileOpen(false);
  }

  // Close the Plan dropdown on outside click / Escape.
  useEffect(() => {
    if (!planOpen) return;
    const onDown = (e: MouseEvent) => {
      if (planRef.current && !planRef.current.contains(e.target as Node)) setPlanOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlanOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [planOpen]);

  const planActive = PLAN_GROUP.some((l) => isActive(l.href));

  return (
    <header className="sticky top-0 z-40 -mx-6 border-b bg-white px-6 shadow-sm">
      <div className="flex items-center justify-between gap-4 py-3">
        <BrandLogo />

        {/* Desktop ribbon */}
        <nav className="hidden items-center gap-1 text-sm font-medium lg:flex" aria-label="Primary">
          {PRIMARY.map((l) => (
            <Link key={l.href} href={l.href} className={desktopLinkCls(isActive(l.href))}>
              {l.label}
            </Link>
          ))}

          <div className="relative" ref={planRef}>
            <button
              type="button"
              onClick={() => setPlanOpen((o) => !o)}
              aria-expanded={planOpen}
              aria-haspopup="true"
              className={`${desktopLinkCls(planActive)} inline-flex items-center gap-1`}
            >
              Plan
              <svg
                className={`h-3.5 w-3.5 transition-transform ${planOpen ? "rotate-180" : ""}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {planOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border bg-white p-2 shadow-lg">
                {PLAN_GROUP.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`block rounded-xl px-3 py-2.5 transition hover:bg-gray-100 ${
                      isActive(l.href) ? "bg-[var(--field-bg)]" : ""
                    }`}
                  >
                    <span className="block font-medium">{l.label}</span>
                    {l.description && (
                      <span className="mt-0.5 block text-xs font-normal text-gray-500">
                        {l.description}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {SECONDARY.map((l) => (
            <Link key={l.href} href={l.href} className={desktopLinkCls(isActive(l.href))}>
              {l.label}
            </Link>
          ))}

          <span className="ml-2">
            <ThemeToggle />
          </span>
        </nav>

        {/* Mobile controls */}
        <div className="flex items-center gap-2 lg:hidden">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            className="rounded-xl border p-2 text-gray-700 hover:bg-gray-100"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              aria-hidden="true"
            >
              {mobileOpen ? (
                <path d="M6 6l12 12M18 6L6 18" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <nav id="mobile-nav" aria-label="Primary" className="border-t pb-4 lg:hidden">
          <div className="grid gap-1 pt-3 text-sm font-medium">
            {[...PRIMARY, ...PLAN_GROUP, ...SECONDARY].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-xl px-3 py-2.5 ${
                  isActive(l.href)
                    ? "bg-[var(--field-bg)] font-semibold text-[var(--field-text)]"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                {l.label}
                {l.description && (
                  <span className="mt-0.5 block text-xs font-normal text-gray-500">
                    {l.description}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
