export default function Home() {
  return (
    <main className="space-y-10">
      <section className="rounded-3xl border bg-white p-10 shadow-sm">
        <h1 className="text-4xl font-semibold tracking-tight">ActivePayOS</h1>
        <p className="mt-4 max-w-2xl text-gray-600">
        Military pay & benefits tools - accurate, visual, and simple. Built for active duty.
        <br />
        <br />
        Here to help. 
      </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <a className="rounded-xl bg-black px-5 py-3 text-sm font-medium text-white" href="/pay">
            Open Pay Calculator -&gt;
          </a>
          <a className="rounded-xl border px-5 py-3 text-sm font-medium" href="/about">
            Why ActivePayOS
          </a>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          { title: "Fast", desc: "Clean inputs, clear outputs, no spreadsheet pain." },
          { title: "Accurate", desc: "Data stored as versioned tables, easy to audit." },
          { title: "Built to grow", desc: "BAH, special pays, taxes, and scenarios next." },
        ].map((x) => (
          <div key={x.title} className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="text-base font-semibold">{x.title}</div>
            <div className="mt-2 text-sm text-gray-600">{x.desc}</div>
          </div>
        ))}
      </section>
    </main>
  );
}
