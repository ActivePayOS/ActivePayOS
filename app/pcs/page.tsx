import type { Metadata } from "next";
import PCSClient from "./pcs-client";

export const metadata: Metadata = {
  title: "PCS Move Planner",
  description:
    "Plan your PCS move and estimate entitlements — DLA, per diem, mileage, and PPM (personally procured move) reimbursement — by rank, travel mode, and distance.",
};

export default function PCSPage() {
  return <PCSClient />;
}