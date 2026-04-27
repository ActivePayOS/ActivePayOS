export default function ContactPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 rounded-3xl border bg-white p-6 md:p-8 shadow-sm">
      <div>
        <h1 className="text-3xl font-semibold">Contact OfficerOS</h1>
        <p className="mt-2 text-sm text-gray-600">
          Questions, bug reports, ideas, or feedback - send them our way.
        </p>
      </div>

      <div className="rounded-2xl border p-5">
        <h2 className="text-lg font-semibold">Email</h2>
        <p className="mt-2 text-sm text-gray-600">
          The simplest way to reach us right now is email.
        </p>
        <a
          href="mailto:hello@officeros.com?subject=OfficerOS%20Question"
          className="mt-3 inline-block text-sm font-medium underline"
        >
          hello@officeros.com
        </a>
      </div>

      <div className="rounded-2xl border p-5">
        <h2 className="text-lg font-semibold">What to send</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-700">
          <li>Questions about how a tool works</li>
          <li>Bug reports or wrong numbers</li>
          <li>Ideas for new calculators or toolkits</li>
          <li>Anything that would make OfficerOS more useful</li>
        </ul>
      </div>

   {/*   <div className="rounded-2xl border bg-gray-50 p-5">
        <h2 className="text-lg font-semibold">Support OfficerOS</h2>
        <p className="mt-2 text-sm text-gray-600">
          OfficerOS is free to use. If it helps you and you want to support the project,
          you can buy us a coffee.
        </p>
       
      </div> */}
    </main>
  );
}