// One-line site-wide hint that the ⓘ dots carry the explanations. Keeps the
// pages themselves quiet (Simon's rule: minimal on-screen text, context on
// hover) while telling first-time visitors the context exists at all.
export default function HoverHint({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[11px] text-gray-400 ${className}`}>
      New to a term? Hover or tap any{" "}
      <span
        aria-hidden
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 align-middle text-[10px] font-semibold leading-none text-gray-400"
      >
        i
      </span>{" "}
      for a plain-English explanation.
    </p>
  );
}
