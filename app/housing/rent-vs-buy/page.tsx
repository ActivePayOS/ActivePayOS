import type { Metadata } from "next";
import RentVsBuyClient from "./rent-vs-buy-client";

export const metadata: Metadata = {
  title: "Rent vs Buy Calculator",
  description:
    "Compare renting versus buying near your duty station — factoring in equity, closing and selling costs, appreciation, and keeping the home as a rental after you PCS.",
};

export default function RentVsBuyPage() {
  return <RentVsBuyClient />;
}
