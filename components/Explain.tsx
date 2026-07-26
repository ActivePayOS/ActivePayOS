// A number or term with a hover explanation. Renders a dotted underline and
// help cursor so it's discoverable, and uses the native title tooltip so it
// works everywhere (including keyboard/screen readers via aria-label) with
// zero JS. Wrap any computed figure whose origin isn't obvious.
export default function Explain({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      title={title}
      aria-label={title}
      className={`cursor-help underline decoration-dotted decoration-gray-400 underline-offset-4 ${className}`}
    >
      {children}
    </span>
  );
}
