import Link from "next/link";

type BrandLogoProps = {
  href?: string;
  size?: "header" | "hero";
};

export default function BrandLogo({
  href = "/",
  size = "header",
}: BrandLogoProps) {
  const isHero = size === "hero";
  const markSize = isHero ? "h-12 w-12 sm:h-20 sm:w-20" : "h-9 w-9";
  const textSize = isHero
    ? "text-3xl font-semibold tracking-normal sm:text-5xl"
    : "text-xl font-semibold tracking-normal";

  const logo = (
    <span
      className="brand-logo inline-flex min-w-0 items-center gap-3"
      aria-label="ActivePayOS"
    >
      <svg
        className={`${markSize} shrink-0`}
        viewBox="0 0 96 96"
        role="img"
        aria-hidden="true"
      >
        <path
          className="fill-[var(--brand-blue)]"
          d="M30 9h31l32 39-32 39H30l32-39L30 9Z"
        />
        <path
          className="fill-[var(--brand-ink)]"
          d="M3 26h29l26 22-26 22H3l26-22L3 26Z"
        />
        <path
          className="fill-[var(--brand-surface)]"
          d="M32 26h13l26 22-26 22H32l26-22L32 26Z"
        />
      </svg>
      <span className={`${textSize} min-w-0 whitespace-nowrap leading-none`}>
        <span className="text-[var(--brand-ink)]">Active</span>
        <span className="text-[var(--brand-blue)]">PayOS</span>
      </span>
    </span>
  );

  return (
    <Link
      href={href}
      className="inline-flex w-fit max-w-full items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]"
    >
      {logo}
    </Link>
  );
}
