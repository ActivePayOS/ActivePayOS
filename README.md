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

It is not an official Department of Defense, DFAS, or U.S. military website. It does not provide legal, tax, financial, or official payroll advice. Pay entitlements can vary based on duty status, location, dependent status, deductions, special pays, government quarters, meal plans, state of legal residence, and service-specific rules.

Always verify major decisions with your Leave and Earnings Statement (LES), myPay, DFAS, and official military guidance.

## Tech Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- ExcelJS

## Local Development

```bash
git clone https://github.com/nickparker52/ActivePayOS.git
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

ActivePayOS is being built toward a community-reviewed, open-source military pay toolkit. The long-term goal is to become a trusted, transparent reference for service members planning around pay, housing, PCS moves, TSP, taxes, and common military life decisions.

## License

All rights reserved unless a later license file says otherwise.
