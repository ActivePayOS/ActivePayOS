export const PAY_DATA_LAST_VERIFIED = "2026-07-15";

export function formatPayDataLastVerified(style: "long" | "short" = "long") {
  const date = new Date(`${PAY_DATA_LAST_VERIFIED}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    month: style === "long" ? "long" : "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
