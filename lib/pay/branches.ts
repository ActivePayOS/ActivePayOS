// Military branches. Base pay, BAH, and BAS are identical across services
// (all-service tables) — branch only affects which special/incentive pays surface
// and a light accent color used to theme one card.

export type BranchId = "army" | "usmc" | "navy" | "usaf" | "ussf" | "uscg";

export type Branch = {
  id: BranchId;
  name: string;
  accent: string; // brand-ish accent for the header chip/bar
  onAccent: string; // readable text color on top of `accent`
};

export const BRANCHES: Branch[] = [
  { id: "army", name: "Army", accent: "#ffcc01", onAccent: "#1a1a1a" },
  { id: "usmc", name: "Marine Corps", accent: "#c8102e", onAccent: "#ffffff" },
  { id: "navy", name: "Navy", accent: "#1d3b73", onAccent: "#ffffff" },
  { id: "usaf", name: "Air Force", accent: "#00308f", onAccent: "#ffffff" },
  { id: "ussf", name: "Space Force", accent: "#4a6fa5", onAccent: "#ffffff" },
  { id: "uscg", name: "Coast Guard", accent: "#f57f29", onAccent: "#1a1a1a" },
];

export function getBranch(id: string): Branch | undefined {
  return BRANCHES.find((b) => b.id === id);
}
