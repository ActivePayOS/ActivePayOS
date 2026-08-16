"use client";

import type { ReactNode } from "react";
import InfoDot from "@/components/InfoDot";

/*
  Shared row/control primitives for the wealth projector's input cards.

  The cards used to be written as prose with controls dropped into a wrapping
  flex row ("Adding [$100] /mo while serving · [$200] /mo after service"). Two
  problems fell out of that: the unit was a *sibling* of its input, so
  flex-wrap regularly stranded "/mo after service" on its own line, and the
  sentences needed a grab-bag of type sizes to stay compact.

  These primitives fix both structurally rather than by tuning:
    · UnitInput puts the prefix, the number, and the unit inside ONE .field
      pill with whitespace-nowrap, so a unit can never be orphaned from its
      input.
    · FieldRow puts a label on the left and the control on the right, so a
      card reads as a scannable list and the controls align down its edge.

  Type scale is deliberately limited to what the cards are allowed to use:
  text-sm for labels, control text and units, text-xs for hints/footnotes.
  Card titles (text-lg) stay in the page.
*/

/** Vertical rhythm for a card's stack of rows. */
export function FieldList({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`mt-3 space-y-2.5 ${className}`.trim()}>{children}</div>;
}

/**
 * One setting: label (with optional InfoDot) on the left, control on the
 * right. The two halves are the only wrap units, so at very narrow widths the
 * control drops to its own line intact — it never splits mid-control.
 */
export function FieldRow({
  label,
  tip,
  control,
  hint,
  className = "",
}: {
  label: ReactNode;
  /** InfoDot copy shown next to the label. */
  tip?: string;
  control: ReactNode;
  /** Optional helper line under the row. */
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-gray-600">
          <span className="min-w-0">{label}</span>
          {tip ? <InfoDot text={tip} /> : null}
        </span>
        <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {control}
        </span>
      </div>
      {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}

/**
 * A single .field pill holding prefix + number + suffix. Nothing inside can
 * wrap, so "$" and "/mo" always travel with the value they belong to.
 */
export function UnitInput({
  value,
  onChange,
  prefix,
  suffix,
  width = "w-16",
  min,
  max,
  step,
  placeholder,
  ariaLabel,
  title,
  disabled = false,
}: {
  value: number | string;
  /** Raw input string — the caller keeps its own clamping/parsing. */
  onChange: (raw: string) => void;
  /** Rendered inside the pill, ahead of the number (e.g. "$"). */
  prefix?: string;
  /** Rendered inside the pill, after the number (e.g. "/mo", "%", "%/yr"). */
  suffix?: string;
  /** Width utility for the number itself — defaults to w-16. */
  width?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  ariaLabel: string;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <span
      className={`field inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-sm ${
        disabled ? "opacity-50" : ""
      }`}
    >
      {prefix ? <span className="shrink-0 text-gray-500">{prefix}</span> : null}
      <input
        type="number"
        inputMode="decimal"
        value={value}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        title={title}
        className={`${width} min-w-0 bg-transparent text-right text-sm outline-none`}
      />
      {suffix ? <span className="shrink-0 text-gray-500">{suffix}</span> : null}
    </span>
  );
}

/** A <select> styled to the same rhythm as UnitInput. */
export function FieldSelect({
  value,
  onChange,
  ariaLabel,
  title,
  children,
  className = "",
}: {
  value: string | number;
  onChange: (raw: string) => void;
  ariaLabel: string;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      title={title}
      className={`field max-w-full rounded-lg px-2 py-1 text-sm outline-none ${className}`.trim()}
    >
      {children}
    </select>
  );
}

/** FieldRow whose control is a select — the common case, spelled once. */
export function SelectRow({
  label,
  tip,
  hint,
  value,
  onChange,
  ariaLabel,
  title,
  after,
  children,
}: {
  label: ReactNode;
  tip?: string;
  hint?: ReactNode;
  value: string | number;
  onChange: (raw: string) => void;
  ariaLabel: string;
  title?: string;
  /** Extra control-side content (a suffix note, a helper button). */
  after?: ReactNode;
  children: ReactNode;
}) {
  return (
    <FieldRow
      label={label}
      tip={tip}
      hint={hint}
      control={
        <>
          <FieldSelect value={value} onChange={onChange} ariaLabel={ariaLabel} title={title}>
            {children}
          </FieldSelect>
          {after}
        </>
      }
    />
  );
}

/**
 * The small helper button that sits beside a control ("Max"). Given a fixed
 * slot on the control side of a row instead of trailing mid-sentence.
 */
export function MiniButton({
  onClick,
  title,
  disabled = false,
  children,
}: {
  onClick: () => void;
  title?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="shrink-0 rounded-lg border px-2 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/** The single footnote line a card is allowed at the bottom. */
export function FieldNote({
  children,
  tone = "muted",
  className = "",
}: {
  children: ReactNode;
  tone?: "muted" | "faint" | "warn";
  className?: string;
}) {
  const toneCls =
    tone === "warn" ? "text-amber-700" : tone === "faint" ? "text-gray-400" : "text-gray-500";
  return <p className={`text-xs leading-5 ${toneCls} ${className}`.trim()}>{children}</p>;
}
