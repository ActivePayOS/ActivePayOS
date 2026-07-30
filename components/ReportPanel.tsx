"use client";

// The one report/download mechanism used across the platform (Pay Calculator,
// Budget Builder, Wealth Projector): the same scope pills, the same format
// select, the same button and privacy note everywhere. Pages own the actual
// generation; this standardizes the UI so exports never look different
// tool-to-tool.

export type ReportScopeOption = {
  value: string;
  label: string;
  /** Short line shown next to the button when this scope is active. */
  hint?: string;
};

export type ReportFormatOption = { value: string; label: string };

/**
 * Multi-select cross-tool sections ("Include in report"): one checkbox-pill
 * per money tool. Unavailable sections render disabled with their hint.
 */
export type ReportSectionOption = {
  id: "pay" | "budget" | "projection";
  label: string;
  available: boolean;
  hint?: string;
};

export const DEFAULT_REPORT_FORMATS: ReportFormatOption[] = [
  { value: "csv", label: "CSV — any spreadsheet" },
  { value: "txt", label: "Text — plain summary" },
  { value: "pdf", label: "PDF — printable" },
];

export default function ReportPanel({
  title = "Download a report",
  description = "Generated entirely in your browser — nothing leaves your device.",
  scopes,
  scope,
  onScopeChange,
  sections,
  selectedSections,
  onSectionsChange,
  formats = DEFAULT_REPORT_FORMATS,
  format,
  onFormatChange,
  onDownload,
  busy = false,
  disabled = false,
  disabledReason,
  error,
}: {
  title?: string;
  description?: string;
  /** Optional scope pills (omit when the tool has a single report). */
  scopes?: ReportScopeOption[];
  scope?: string;
  onScopeChange?: (value: string) => void;
  /** Optional multi-select tool sections (omit for a single-tool report). */
  sections?: ReportSectionOption[];
  selectedSections?: string[];
  onSectionsChange?: (ids: string[]) => void;
  formats?: ReportFormatOption[];
  format: string;
  onFormatChange: (value: string) => void;
  onDownload: () => void;
  busy?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  error?: string | null;
}) {
  const activeScope = scopes?.find((s) => s.value === scope);
  const selected = selectedSections ?? [];
  const toggleSection = (id: string) => {
    onSectionsChange?.(
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
    );
  };
  return (
    <div className="rounded-2xl border p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-gray-500">{description}</p>

      {scopes && scopes.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-1 rounded-xl border p-1 text-xs">
          {scopes.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => onScopeChange?.(s.value)}
              className={`rounded-full px-3 py-1 font-medium transition ${
                scope === s.value
                  ? "bg-[var(--field-bg)] text-[var(--field-text)]"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {sections && sections.length > 0 && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Include in report
            </span>
            <span className="flex items-center gap-2 text-[11px]">
              <button
                type="button"
                onClick={() =>
                  onSectionsChange?.(sections.filter((s) => s.available).map((s) => s.id))
                }
                className="font-medium text-gray-500 transition hover:text-gray-900"
              >
                All
              </button>
              <span aria-hidden="true" className="text-gray-300">
                /
              </span>
              <button
                type="button"
                onClick={() => onSectionsChange?.([])}
                className="font-medium text-gray-500 transition hover:text-gray-900"
              >
                None
              </button>
            </span>
          </div>
          <div
            role="group"
            aria-label="Include in report"
            className="mt-1.5 flex flex-wrap items-center gap-1 rounded-xl border p-1 text-xs"
          >
            {sections.map((s) => {
              const checked = selected.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={checked}
                  disabled={!s.available}
                  title={!s.available ? s.hint : undefined}
                  onClick={() => toggleSection(s.id)}
                  className={`rounded-full px-3 py-1 font-medium transition ${
                    !s.available
                      ? "cursor-not-allowed text-gray-400 opacity-60"
                      : checked
                        ? "bg-[var(--field-bg)] text-[var(--field-text)]"
                        : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {checked ? "✓ " : ""}
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label htmlFor="report-panel-format" className="sr-only">
          Report format
        </label>
        <select
          id="report-panel-format"
          value={format}
          onChange={(e) => onFormatChange(e.target.value)}
          className="field rounded-full px-3 py-2 text-sm"
        >
          {formats.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onDownload}
          disabled={busy || disabled}
          title={disabled ? disabledReason : undefined}
          className="rounded-full border border-black bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Preparing…" : "Download report"}
        </button>
        {activeScope?.hint && <span className="text-xs text-gray-500">{activeScope.hint}</span>}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
