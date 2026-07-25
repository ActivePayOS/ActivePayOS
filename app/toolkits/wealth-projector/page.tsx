import type { Metadata } from "next";
import WealthProjectorClient from "./wealth-projector-client";
import basepay2026 from "@/data/basepay/2026.json";
import type { BasePayDataset } from "@/lib/pay/basepay-lookup";

export const metadata: Metadata = {
  title: "Wealth Projector",
  description:
    "Project your TSP, investments, and savings across your service commitment and beyond — typical promotions drive your pay and match, then everything compounds to any age you pick.",
};

export default function Page() {
  return <WealthProjectorClient basepay={basepay2026 as unknown as BasePayDataset} />;
}
