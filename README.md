# ActivePayOS

ActivePayOS is a military pay and planning website built to help service members understand their compensation, housing allowance, taxable vs. non-taxable pay, and budgeting decisions.

The goal is simple: make military pay easier to check, explain, and plan around while keeping official sources and limitations visible.

Live site: https://activepayos.com

## What It Includes

- 2026 active-duty pay calculator
- Base pay, BAH, BAS, taxable income, non-taxable income, and FICA breakdowns
- BAH lookup by duty ZIP code, including ZIP+4 support
- Barracks / government housing option for members who do not receive BAH
- State of legal residence context for all 50 states and DC
- Budget spreadsheet export with pay inputs and planning targets
- Housing, PCS, and military life planning tools
- Plain-English military pay terms
- Public Data & Accuracy page with source and coverage notes

## Accuracy Approach

ActivePayOS uses versioned public reference data and keeps verification visible. The current data layer includes:

- DFAS 2026 base pay tables
- DFAS BAS reference data
- DTMO / Military Pay 2026 BAH tables
- 2026 ZIP-to-MHA mapping
- State tax context links and planning notes

The site separates verified source data from estimates. Base pay, BAS, and BAH are treated as source-backed calculator inputs. FICA, budget exports, and state tax context are planning aids and should be checked against official records.

Run the pay data audit locally:

```bash
npm run audit:pay-data
```

## Important Limitations

ActivePayOS is for education and planning only.

It is not an official U.S. Department of War / Department of Defense (DoD), DFAS, or U.S. military website. It does not provide legal, tax, financial, or official payroll advice. Pay entitlements can vary based on duty status, location, dependent status, deductions, special pays, government quarters, meal plans, state of legal residence, and service-specific rules.

Always verify major decisions with your Leave and Earnings Statement (LES), myPay, DFAS, and official military guidance.

## Tech Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- ExcelJS

## Local Development

```bash
git clone https://github.com/ActivePayOS/ActivePayOS.git
cd ActivePayOS
npm install
npm run dev
```

Open http://localhost:3000.

## Checks

Before publishing changes, run:

```bash
npm run audit:pay-data
npm run lint
npm run build
```

## Project Direction

ActivePayOS is being built in public as a community-reviewed military pay toolkit. The long-term goal is to become a trusted, transparent reference for service members planning around pay, housing, PCS moves, TSP, taxes, and common military life decisions.

The repository is public and **open source** so anyone can inspect the source, verify the data approach, report issues, and propose improvements. This is a community-owned, non-profit public good: we are actively looking for collaborators and want the community to help drive development alongside the maintainers.

## Privacy

All calculators run entirely in the browser — pay grade, dependent status, ZIP code, and budget inputs are never stored or logged. The only server round trip is the optional file export (budget spreadsheet/PDF and timeline downloads), which uses your inputs in memory to generate the file and discards them. There are no accounts, no database, no analytics, and no ads. See the [Privacy page](https://activepayos.com/privacy).

## Security

Please report vulnerabilities privately via [GitHub private vulnerability reporting](https://github.com/ActivePayOS/ActivePayOS/security/advisories/new) or contact@activepayos.com (subject: `SECURITY`) — not in a public issue. See [SECURITY.md](SECURITY.md) for scope and testing guidelines; in short, test against a local clone rather than the live site.

## Contributing & community

ActivePayOS is community-owned and we would love your help — code, data accuracy, ideas, or feedback. See [CONTRIBUTING.md](CONTRIBUTING.md), browse the [open issues](https://github.com/ActivePayOS/ActivePayOS/issues), or [file a ticket](https://github.com/ActivePayOS/ActivePayOS/issues/new).

## License

ActivePayOS is **open source**.

- **Code** (everything we wrote — app, components, data-processing scripts, schemas, validation, and copy) is licensed under the **GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)**. You are free to use, study, modify, and redistribute it; if you run a modified version as a network service, AGPL requires you to make your source available to its users. See [LICENSE](LICENSE).
- **Reference data** under `data/` originates from U.S. Government sources (DFAS, DTMO/MHA) and is in the **public domain** (17 U.S.C. § 105). See [NOTICE](NOTICE).
- **Brand:** the name "ActivePayOS," the logo, and activepayos.com are not covered by the code license — a fork or derivative must use its own name and branding.

Copyright (C) 2026 Simon Gott, Nick Parker, and ActivePayOS contributors.

ActivePayOS is not an official U.S. Department of War / Department of Defense (DoD), DFAS, or U.S. military website and is not affiliated with any branch of the U.S. military. It does not provide legal, tax, or financial advice. Always verify with your LES, myPay, and DFAS.
