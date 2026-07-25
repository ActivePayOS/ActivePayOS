# Security Policy

ActivePayOS is a free, open-source, educational military pay planning tool. We take
security reports seriously — especially anything that could expose user inputs
(pay grade, dependent status, duty ZIP code) or let an attacker alter the pay
figures the site displays.

## How to report a vulnerability

Please report vulnerabilities **privately** — do not open a public GitHub issue
for a security problem.

- **Preferred:** [GitHub private vulnerability reporting](https://github.com/ActivePayOS/ActivePayOS/security/advisories/new)
  ("Report a vulnerability" on the repository's Security tab).
- **Email:** contact@activepayos.com with the subject line `SECURITY`.

Include what you found, where (URL or file), steps to reproduce, and the impact
you believe it has. We will acknowledge your report within 7 days, keep you
updated as we work on a fix, and credit you when it ships unless you prefer to
stay anonymous. There is currently no paid bug bounty.

## Scope

**In scope**

- The live site at https://activepayos.com (and its `/api/*` routes)
- The code and data pipeline in this repository
- Anything that could cause incorrect pay figures to be served from our data
  files, or expose information a user entered

**Out of scope**

- Denial-of-service, load, or volumetric testing of any kind against the live site
- Automated high-volume scanning of the live site (clone the repo and run it
  locally instead — `npm install && npm run dev` gives you the full site)
- Social engineering, phishing, or physical attacks
- Third-party infrastructure we don't control (hosting provider, GitHub, DNS
  registrar) — report those to the vendor
- Vulnerabilities that require a compromised device or browser

## Testing guidelines

If you want to probe how the tools behave, please run the site locally from
source rather than testing against activepayos.com. Everything on the live site
is in this repository, so a local clone is a faithful target with no rules-of-
engagement concerns.

If you act in good faith, stay within the scope above, avoid degrading the
service for others, and don't access or retain data that isn't yours, we will
not pursue action against your research and will work with you to understand
and fix the issue.
