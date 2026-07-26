"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { hasSavedBudget, loadPaySnapshot } from "@/lib/profile/handoff";

// The journey strip: one slim, consistent bar on the Pay Calculator, Budget
// Builder, and Wealth Projector that shows the three-step flow, which steps
// already have data on this device, and where to go next. This is the whole
// "where am I" articulation — deliberately one line so it never competes
// with the tool itself.

const emptySubscribe = () => () => {};

export type PlanStep = "pay" | "budget" | "project";

const STEPS: { key: PlanStep; label: string; href: string; explain: string }[] = [
  {
    key: "pay",
    label: "Calculate pay",
    href: "/",
    explain: "Your grade, time in service, and duty station set your real monthly pay.",
  },
  {
    key: "budget",
    label: "Build budget",
    href: "/budget",
    explain: "Turn that pay into a plan — taxes off the top, then needs, wants, and savings.",
  },
  {
    key: "project",
    label: "Project wealth",
    href: "/toolkits/wealth-projector",
    explain: "See what the plan compounds into over your service commitment and beyond.",
  },
];

export default function PlanFlow({ current }: { current: PlanStep }) {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  // Read once per render after mount; both are cheap localStorage reads.
  const snapshot = mounted ? loadPaySnapshot() : null;
  const budgetSaved = mounted ? hasSavedBudget() : false;

  const done: Record<PlanStep, boolean> = {
    pay: !!snapshot,
    budget: budgetSaved,
    project: false, // the projector recomputes live; it's a destination, not a state
  };
  const summary: Record<PlanStep, string | null> = {
    pay: snapshot
      ? `${snapshot.grade} · ${snapshot.yos} YOS${
          snapshot.grossMonthly ? ` · $${Math.round(snapshot.grossMonthly).toLocaleString()}/mo` : ""
        }`
      : null,
    budget: budgetSaved ? "saved on this device" : null,
    project: null,
  };

  return (
    <nav
      aria-label="Planning flow"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border bg-white px-4 py-2.5 text-xs shadow-sm"
    >
      <span className="mr-1 font-semibold uppercase tracking-wide text-gray-400">Your flow</span>
      {STEPS.map((s, i) => {
        const isCurrent = s.key === current;
        const isDone = done[s.key] && !isCurrent;
        return (
          <span key={s.key} className="flex items-center gap-2">
            {i > 0 && <span className="text-gray-300">→</span>}
            <Link
              href={s.href}
              title={s.explain}
              aria-current={isCurrent ? "step" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition ${
                isCurrent
                  ? "bg-[var(--field-bg)] text-[var(--field-text)]"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <span
                className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                  isDone
                    ? "bg-emerald-500 text-white"
                    : isCurrent
                    ? "bg-[var(--brand-blue)] text-white"
                    : "border text-gray-400"
                }`}
                aria-hidden="true"
              >
                {isDone ? "✓" : i + 1}
              </span>
              {s.label}
              {summary[s.key] && (
                <span
                  className="hidden text-[11px] font-normal text-gray-400 sm:inline"
                  title={
                    s.key === "pay"
                      ? "Snapshot the Pay Calculator saved on this device — the Wealth Projector starts from it."
                      : "Your budget auto-saves in this browser; the projector can pull its savings categories."
                  }
                >
                  ({summary[s.key]})
                </span>
              )}
            </Link>
          </span>
        );
      })}
      <span className="ml-auto hidden text-[11px] text-gray-400 md:inline">
        Data flows forward automatically — start anywhere.
      </span>
    </nav>
  );
}
