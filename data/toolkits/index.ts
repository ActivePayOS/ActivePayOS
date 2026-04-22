import type { Toolkit } from "./types";
import { juniorEnlisted } from "./junior-enlisted";
import { justMarried } from "./just-married";
// import others the same way

export const toolkits: Toolkit[] = [
  juniorEnlisted,
  justMarried,
  // ...
];

export function getToolkit(slug: string): Toolkit | undefined {
  return toolkits.find((t) => t.slug === slug);
}