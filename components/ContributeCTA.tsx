// Shared GitHub links + a contribute / feedback call-to-action used across the
// site. ActivePayOS is open source and community-owned, so contributions and
// feedback both flow through the public repo.

export const GITHUB_REPO = "https://github.com/nickparker52/ActivePayOS";
export const GITHUB_ISSUES = `${GITHUB_REPO}/issues`;
export const GITHUB_NEW_ISSUE = `${GITHUB_REPO}/issues/new`;

export default function ContributeCTA() {
  return (
    <section className="rounded-3xl border bg-gray-50 p-6 shadow-sm md:p-8">
      <h2 className="text-xl font-semibold tracking-tight">Help build ActivePayOS</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
        ActivePayOS is open source and <strong>community-owned</strong> — and we want the community
        to help drive where it goes. We are actively looking for collaborators. If you write code,
        check numbers, or just have ideas, we would love the help: jump into the repo, pick up an
        open issue, or tell us what to fix or add. Built in the open, by and for the military
        community.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border bg-white p-5">
          <div className="text-sm font-semibold">Join as a developer</div>
          <p className="mt-1 text-sm text-gray-600">
            Frontend, data, accuracy checks, new calculators — all welcome. Read the code, star the
            repo, and open a pull request.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <a
              href={GITHUB_REPO}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border px-4 py-2 font-medium hover:bg-gray-100"
            >
              View the repo →
            </a>
            <a
              href={GITHUB_ISSUES}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border px-4 py-2 font-medium hover:bg-gray-100"
            >
              Browse open issues →
            </a>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5">
          <div className="text-sm font-semibold">Have feedback or found a bug?</div>
          <p className="mt-1 text-sm text-gray-600">
            A wrong number, a confusing flow, or a feature you want? Leave us a note on GitHub — it
            becomes a ticket we can track and fix in the open.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <a
              href={GITHUB_NEW_ISSUE}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-black bg-black px-4 py-2 font-medium text-white hover:bg-gray-800"
            >
              Leave feedback / file a ticket →
            </a>
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs text-gray-500">
        Prefer email? Reach us at{" "}
        <a href="mailto:contact@activepayos.com" className="underline">
          contact@activepayos.com
        </a>
        .
      </p>
    </section>
  );
}
