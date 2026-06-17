import type { Toolkit } from "./types";

export const budgetPlanner: Toolkit = {
  slug: "budget-planner",
  title: "Budget Planner",
  subtitle:
    "Build a clean monthly plan using your Base Pay, BAH, and BAS. Export your sheet in one click.",
  sections: [
    {
      type: "checklist",
      title: "How to Use It",
      items: [
        "Go to Pay Calculator and enter your details.",
        'Click "Download Budget Sheet (.xlsx)".',
        "Only edit the blue cells-everything else updates automatically.",
        'Use the "Start Here" targets to set housing/food/savings baselines.',
      ],
    },
    {
      type: "checklist",
      title: "Rules That Keep You Safe",
      items: [
        "Housing (rent + utilities) should generally fit inside your BAH target.",
        "Make savings automatic (small is fine-consistency wins).",
        "If you have high-interest debt, prioritize it before upgrades.",
        "Re-run the Pay Calculator whenever rank/YOS/ZIP changes.",
      ],
    },
    {
      type: "actions",
      title: "ActivePayOS Actions",
      actions: [
        { label: "Budget Builder", href: "/budget", note: "Build a budget and see it as a Sankey — no Excel needed" },
        { label: "Pay Calculator", href: "/pay", note: "Download the Excel export from here" },
        { label: "Toolkits Home", href: "/toolkits", note: "Pick a life-stage plan" },
      ],
    },
    {
      type: "actions",
      title: "Official Links",
      actions: [{ label: "DFAS (Pay Info)", href: "https://www.dfas.mil/" }],
    },
    {
      type: "text",
      title: "New: Budget Builder",
      text: "You can now build a budget right inside ActivePayOS — no Excel needed — and see your income and spending as an exportable Sankey diagram. It runs entirely in your browser. Open the Budget Builder above. Coming next: paycheck split planning.",
    },
  ],
};
