"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Toolkit, ToolkitSection } from "@/data/toolkits/types";

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function storageKey(toolkitSlug: string) {
  return `officeros:toolkit:${toolkitSlug}:checks`;
}

export default function ToolkitPage({ toolkit }: { toolkit: Toolkit }) {
  // Collect all checklist items into stable keys for persistence
  const checklistKeys = useMemo(() => {
    const keys: string[] = [];
    toolkit.sections.forEach((sec) => {
      if (sec.type !== "checklist") return;
      const sectionId = sec.id ?? slugify(sec.title);
      sec.items.forEach((_, idx) => keys.push(`${sectionId}:${idx}`));
    });
    return keys;
  }, [toolkit]);

  const [checked, setChecked] = useState<Record<string, boolean>>({});

  // Load saved progress
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(toolkit.slug));
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") setChecked(parsed);
    } catch {
      // ignore
    }
  }, [toolkit.slug]);

  // Save progress
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(toolkit.slug), JSON.stringify(checked));
    } catch {
      // ignore
    }
  }, [checked, toolkit.slug]);

  const total = checklistKeys.length;
  const done = checklistKeys.filter((k) => checked[k]).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  function toggle(key: string) {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function clearAll() {
    setChecked({});
  }

  function renderSection(sec: ToolkitSection) {
    if (sec.type === "text") {
      return (
        <section key={sec.title} className="rounded-3xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">{sec.title}</h2>
          <p className="mt-2 text-gray-600">{sec.text}</p>
        </section>
      );
    }

    if (sec.type === "bullets") {
      return (
        <section key={sec.title} className="rounded-3xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">{sec.title}</h2>
          <ul className="mt-3 list-disc pl-5 text-gray-700 space-y-2">
            {sec.items.map((it) => (
              <li key={it}>{it}</li>
            ))}
          </ul>
        </section>
      );
    }

    if (sec.type === "actions") {

        // inside: if (sec.type === "actions") { ... }
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
    {sec.actions.map((a) => {
        const isExternal = a.href.startsWith("http");
        const CardInner = (
        <>
            <div className="font-semibold">{a.label}</div>
            {a.note ? <div className="mt-1 text-sm text-gray-600">{a.note}</div> : null}
            <div className="mt-2 text-sm">Open →</div>
        </>
        );

        const className =
        "rounded-2xl border bg-white p-4 shadow-sm hover:shadow transition";

        return isExternal ? (
        <a
            key={a.href + a.label}
            href={a.href}
            target="_blank"
            rel="noreferrer"
            className={className}
        >
            {CardInner}
        </a>
        ) : (
        <Link key={a.href + a.label} href={a.href} className={className}>
            {CardInner}
        </Link>
        );
    })}
    </div>
      return (
        <section key={sec.title} className="rounded-3xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">{sec.title}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {sec.actions.map((a) => (
              <Link
                key={a.href + a.label}
                href={a.href}
                className="rounded-2xl border bg-white p-4 shadow-sm hover:shadow transition"
              >
                <div className="font-semibold">{a.label}</div>
                {a.note ? <div className="mt-1 text-sm text-gray-600">{a.note}</div> : null}
                <div className="mt-2 text-sm">Open →</div>
              </Link>
            ))}
          </div>
        </section>
      );
    }

    // checklist
    const sectionId = sec.id ?? slugify(sec.title);
    return (
      <section key={sec.title} className="rounded-3xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{sec.title}</h2>
        <ul className="mt-4 space-y-3">
          {sec.items.map((it, idx) => {
            const key = `${sectionId}:${idx}`;
            const isChecked = !!checked[key];
            return (
              <li key={key} className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  className={[
                    "mt-0.5 h-5 w-5 rounded border flex items-center justify-center",
                    isChecked ? "bg-black text-white" : "bg-white",
                  ].join(" ")}
                  aria-label={isChecked ? "Mark incomplete" : "Mark complete"}
                >
                  {isChecked ? "✓" : ""}
                </button>
                <span className={["text-gray-700", isChecked ? "line-through opacity-70" : ""].join(" ")}>
                  {it}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-10 space-y-8">
      <header className="space-y-3">
        <div>
          <h1 className="text-3xl font-semibold">{toolkit.title}</h1>
          <p className="mt-2 text-gray-600">{toolkit.subtitle}</p>
        </div>

        {total > 0 ? (
          <div className="rounded-3xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm text-gray-700">
                Progress: <span className="font-semibold">{done}</span> / {total} ({pct}%)
              </div>
              <button
                type="button"
                onClick={clearAll}
                className="text-sm underline text-gray-700 hover:text-black"
              >
                Reset
              </button>
            </div>
            <div className="mt-3 h-2 w-full rounded-full bg-gray-100">
              <div className="h-2 rounded-full bg-black" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ) : null}
      </header>

      {toolkit.sections.map(renderSection)}
    </main>
  );
}