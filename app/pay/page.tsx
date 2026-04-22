import PayClient from "./pay-client";

import basepay2026 from "@/data/basepay/2026.json";
import bas2026 from "@/data/bas/2026.json";

export default function PayPage() {
  return (
    <PayClient
      initialYear={2026}
      basepay={basepay2026}
      bas={bas2026}
    />
  );
}