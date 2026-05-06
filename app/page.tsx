import BrandLogo from "@/components/BrandLogo";

export default function Home() {
  const commitments = [
    {
      label: "Auditable Data",
      text: "Versioned 2026 pay, BAS, and BAH tables with visible source notes and repeatable checks.",
    },
    {
      label: "Built In Public",
      text: "Designed to become a community-reviewed, open-source military pay reference.",
    },
    {
      label: "Service Member First",
      text: "Plain-English tools for pay, housing, PCS, taxes, and financial decisions.",
    },
  ];

  return (
    <main className="space-y-10">
      <section className="rounded-3xl border bg-white p-6 shadow-sm sm:p-10">
        <h1>
          <BrandLogo size="hero" />
        </h1>
        <p className="mt-4 max-w-2xl text-gray-600">
          Military pay & benefits tools - accurate, visual, and simple. Built for
          active duty.
          <br />
          <br />
          Here to help.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <a
            className="rounded-xl bg-[var(--brand-blue)] px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-[var(--brand-blue-dark)]"
            href="/pay"
          >
            Open Pay Calculator -&gt;
          </a>
          <a
            className="rounded-xl border px-5 py-3 text-sm font-medium transition hover:border-[var(--brand-blue)] hover:text-[var(--brand-blue)]"
            href="/about"
          >
            Why ActivePayOS
          </a>
        </div>
      </section>

      <section className="rounded-3xl border bg-white p-6 shadow-sm md:p-8">
        <div className="grid gap-6 md:grid-cols-[1.1fr_1.9fr] md:items-start">
          <div>
            <p className="text-sm font-medium text-gray-500">Where this is going</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              Built to become the trusted military pay toolkit.
            </h2>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              ActivePayOS is being shaped around accuracy, transparency, and
              community review so service members can understand the numbers before
              they make real financial decisions.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {commitments.map((item) => (
              <div key={item.label} className="border-l pl-4">
                <div className="text-sm font-semibold">{item.label}</div>
                <p className="mt-2 text-sm leading-6 text-gray-600">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
