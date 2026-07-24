import type { Metadata } from "next";
import AffordabilityClient from "./affordability-client";

export const metadata: Metadata = {
  title: "Housing Affordability Check",
  description:
    "Check whether a rental fits your BAH. Enter your rank, duty ZIP, and monthly housing costs to see if a place looks comfortable, tight, or risky for your budget.",
};

export default function HousingAffordabilityPage() {
  return <AffordabilityClient />;
}
