"use client";

// The ⓘ popover from the Design Lab, promoted to a shared component: helper
// text stays out of the layout until asked for. Opens on hover (desktop) and
// on tap/focus (mobile & keyboard) with no JS state — pure CSS visibility.
export default function InfoDot({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  return (
    <span className={`group relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        aria-label={text}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 text-[10px] font-semibold leading-none text-gray-400 transition hover:border-gray-500 hover:text-gray-700"
      >
        i
      </button>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute left-1/2 top-full z-30 mt-2 w-64 max-w-[75vw] -translate-x-1/2 rounded-xl bg-slate-900 px-3 py-2 text-left text-[11px] font-normal normal-case leading-4 tracking-normal text-slate-100 opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
