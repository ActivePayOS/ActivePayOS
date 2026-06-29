# ActivePayOS — Licensing, Open-Source & Legal Risk Strategy

_Working strategy document. Last updated 2026-06-15._

This document answers three questions:

1. **What license should ActivePayOS use?**
2. **How do we stay defensible while being genuinely open source?**
3. **What is our realistic risk of being sued, given mil-cents.com and other calculators exist?**

---

## 0. TL;DR (the recommendation)

**Project intent (clarified):** This is a **non-profit, community-owned public good** — the premier, community-shaped open-source military pay calculator, intended to grow into a broader family of community-driven service-member tools. There is **no profit motive.** That simplifies several choices below: no CLA/dual-licensing hassle, and the license rationale is about **protecting the commons from enclosure**, not protecting revenue.

| Decision | Recommendation | Why |
|---|---|---|
| **Code license** | **AGPL-3.0-or-later** | OSI-approved "real" open source (satisfies *transparent* + *contributors* + *open source*). As a **copyleft for the commons**, it guarantees that any improvement anyone makes — even when run only as a website — comes back to the community and can never be enclosed into a closed product. That is exactly the "community-owned, can't be captured" property you want. |
| **Government data** | Mark explicitly as **U.S. Government works / public domain (17 U.S.C. § 105)** in a `DATA-LICENSE` / `NOTICE` file | The DFAS / DTMO pay, BAH, and BAS numbers are not yours to license. Saying so is honest *and* removes a copyright attack surface. |
| **Original content & code we author** | Covered by AGPL above; our *curation, mappings, scripts, copy, design* are the protectable part | This is where the project's actual IP lives, not the raw numbers. |
| **Brand** | Protect **"ActivePayOS" name + logo + domain** as the community's mark — held **neutrally on behalf of the project**, not as a private asset | A fork can legally use AGPL code but **cannot** call itself ActivePayOS. Trademark — not copyright — is what keeps the *official* community version trusted. |
| **Contributions** | **DCO (Developer Certificate of Origin)** via `Signed-off-by`. **No CLA.** | With no commercial-licensing ambition, a CLA only adds friction. DCO keeps provenance clean and signals "your contribution stays in the commons, nobody can take it private — including us." |
| **Governance** | Start as maintainer-led, but **publish a path to community stewardship** (see §4.4) | "Community-owned" has to be structural, not just a slogan. A visible governance model and neutral brand-holding are what make the ownership real and let it "blossom." |
| **The contradiction to fix first** | Retire the current "All rights reserved" `LICENSE` and the "not permission to copy" line in the README | They make the project *not* open source and will repel the contributors you're trying to attract. |

**One-line positioning:** _"The community-owned military pay tool you can actually check — open source, public data, no black box."_

---

## 1. The core tension (name it, then resolve it)

You stated four goals:

- (A) Be **genuinely helpful**.
- (B) Be **transparent** — anyone can read the code.
- (C) Be **open source** with **outside contributors**.
- (D) (Originally framed in the README/LICENSE as) **prevent others from copying, rebranding, hosting, or commercializing** it — now better understood, given the non-profit intent, as **"keep it from being enclosed; keep the commons open and community-owned."**

**(C) and the *old* framing of (D) were in direct tension.** True open source (the OSI definition) *requires* allowing reuse, modification, and redistribution — including commercial. You cannot simultaneously say "open source, please contribute" and "you may not use this." Your repo currently does exactly that, and it is the single biggest blocker to your goal. But once the goal is **protecting the commons rather than protecting a business**, the tension dissolves — copyleft is the tool built for precisely that.

**How we resolve it:**

- We drop the *unenforceable / off-mission* part of (D): trying to forbid all reuse of code. (It's incompatible with open source, the underlying *data* isn't ours to forbid anyway, and you're not trying to monopolize a market — you're trying to seed one.)
- We keep the part that actually matters — **the commons stays open and the community's version stays the trusted one** — through **three real protections** that open source *strengthens* rather than weakens:
  1. **Copyleft (AGPL):** anyone can fork or rehost, but they must keep their version open and contribute improvements back to the commons. Nobody can take the community's work private. This is the structural guarantee of "community-owned."
  2. **Trademark / brand, held neutrally for the project:** a fork can't call itself *ActivePayOS*. The name, logo, and domain mark the canonical, community-stewarded version.
  3. **Trust + freshness + community:** the thing that actually makes one calculator "the premier one" (see §4).

> **Bottom line:** You're not trying to stop people from using the code — you *want* that. You're making sure the commons can't be captured and that the community's version stays the trusted reference. Open source and copyleft are how you guarantee both.

---

## 2. License recommendation, in detail

### 2.1 Recommended: **AGPL-3.0-or-later** for the application code

Why AGPL specifically (not MIT/Apache, not source-available):

- **It is genuinely open source** (OSI-approved). This is what lets you honestly say "open source," and what contributors look for before donating work.
- **It closes the "SaaS loophole."** Plain GPL only triggers on *distribution*; a web app is never distributed, so a competitor could fork a GPL/MIT calculator, improve it privately, and run a closed paid service. **AGPL § 13** requires anyone who *runs a modified version as a network service* to offer their source. Nextcloud, Mastodon, Plausible, and Grafana-era tools use AGPL for exactly this reason.
- **Net effect for you:** Anyone is free to learn from, audit, and contribute to ActivePayOS. But a would-be commercial cloner gets a bad deal — they must publish their changes, and they still can't use your name. That is the strongest *open-source* deterrent available.

**The honest trade-off:** AGPL is "scarier" to big companies and slightly narrows your contributor pool vs. MIT (some devs avoid copyleft; some employers ban AGPL). For a mission-driven public-good tool aimed at service members, this is the right trade — you want contributors who share the values, and you specifically *do not* want a defense-adjacent vendor swallowing it.

### 2.2 The alternative (only if maximum adoption beats protection): **Apache-2.0**

Choose this **instead** only if your #1 priority flips to "as many people building on it as possible, including companies, and we don't care if someone forks it commercially." Apache-2.0 adds an explicit patent grant and is the most contributor/employer-friendly permissive license. **Downside:** it does nothing to stop a closed-source commercial clone — your *only* remaining defense is the brand. Given you explicitly want to discourage rebrand-and-sell, **AGPL is the better fit.** (Plain MIT is Apache-2.0 minus the patent grant and explicit trademark note — no reason to prefer it here.)

### 2.3 What is NOT recommended

- **Current "All rights reserved" / source-available:** Not open source. Kills goal (C). Provides a *false* sense of protection (the data isn't yours; the code value is curation, not secrets). **Retire it.**
- **Custom "you may look but not use" licenses (BSL, Elastic-style, hand-rolled):** Legally murky, scares contributors, signals "not really open." Avoid.

### 2.4 Handling the government data correctly (important)

The pay tables are the heart of the product, and **you do not own them**:

- DFAS base pay tables, BAS rates, DTMO/MHA BAH tables, and ZIP-to-MHA mappings are **U.S. Government works → public domain** (`17 U.S.C. § 105`). No one can copyright the numbers — not DFAS, not mil-cents, not you.
- **Action:** Add a `NOTICE` (or `DATA-LICENSE.md`) that states: raw government reference data under `/data/**` is public-domain U.S. Government work; **our normalization scripts, schema, curation, validation logic, and presentation are the original work licensed under AGPL-3.0.** This is the honest and legally clean split, and it doubles as a *transparency selling point*.
- This split is also your answer to "could mil-cents sue us for using the same pay tables?" — **No. Neither of you owns them.**

### 2.5 Contributor mechanics

- **Use DCO. No CLA.** Add a `CONTRIBUTING.md` requiring `git commit -s` (Signed-off-by). It's the low-friction Linux-kernel model: contributors certify they have the right to submit, no one takes ownership of their copyright, and there's no "assign your rights to us" form that deters drive-by contributors. Because there's **no commercial-licensing ambition**, the usual reason to use a CLA (preserving the right to dual-license) doesn't apply — skip it. The absence of a CLA is itself a trust signal: "your work stays in the commons; not even the maintainers can take it private."
- Add: `CODE_OF_CONDUCT.md`, issue/PR templates, a "good first issue" label, and a short architecture note so contributors can find their footing.

---

## 3. Files to change (concrete, do this first)

1. **Replace `LICENSE`** with the AGPL-3.0 text (verbatim from gnu.org) + copyright line `Copyright (c) 2026 Nicholas Parker and ActivePayOS contributors`.
2. **`package.json`:** change `"license": "UNLICENSED"` → `"license": "AGPL-3.0-or-later"`. (Optionally drop `"private": true` if you publish.)
3. **`README.md`:** delete the paragraph that says _"Public visibility is not permission to copy, host, rebrand, commercialize, or republish…"_ and the "All rights reserved" License section. Replace with a short, accurate open-source + brand-use statement (template in §6).
4. **Add `NOTICE` / `DATA-LICENSE.md`** describing the public-domain data vs. AGPL original-work split (§2.4).
5. **Add `CONTRIBUTING.md` (DCO), `CODE_OF_CONDUCT.md`, `TRADEMARK.md`** (brand-use policy, §5.2).
6. **Add `SECURITY.md`** (how to report data errors / vulnerabilities) — doubly important for a tool people make money decisions on.

---

## 4. Positioning & growth strategy

### 4.1 The real moat is trust, not code secrecy

Anyone can vibe-code a pay calculator now — that's exactly why "I have code you can't see" is worthless and "you can verify every number I show you" is gold. Lean all the way in:

- **"Show your work" as the brand.** Every figure links to its DFAS/DTMO source and its version. Your existing `/accuracy` page and `npm run audit:pay-data` are the differentiator — feature them on the landing page, not buried.
- **Versioned, dated data with a public changelog.** "BAH tables updated 2026-01-02, verified against DTMO release X." Freshness + provenance is something a fork or a closed competitor struggles to match consistently.
- **Open issue tracker = visible accountability.** When a service member finds a wrong number and you fix it in public, that *builds* trust. mil-cents has a Reddit forum doing this informally; you can make it native to the product.

### 4.2 Why being open source *beats* mil-cents rather than copying it

mil-cents.com is the incumbent (1–2 yrs, active Reddit feedback loop) but appears **closed-source, no visible license, no cited sources, anonymous operator.** Your wedge is the inverse of all four:

| Dimension | mil-cents (observed) | ActivePayOS positioning |
|---|---|---|
| Source code | Not public | **Public, AGPL, auditable** |
| Data sourcing | Not cited on-page | **Every number sourced + versioned** |
| Operator | Anonymous | **Named, accountable, contactable** |
| Community | Reddit (off-platform) | **In-repo issues + contributors + on-site** |
| Trust basis | "Trust the output" | **"Verify the output"** |

You don't need to out-feature them on day one. You need to be the **trustworthy, checkable, community-owned** option. That's a position they can't cheaply copy without open-sourcing themselves.

### 4.3 Attracting contributors

- Publish a **roadmap** and a list of **scoped, well-described issues** (new BAH year, a branch's special pay, a state-tax edge case). Pay/benefits nerds and junior devs with military ties are your contributor base — recruit in r/MilitaryFinance, r/AirForce, etc. (give, don't spam).
- Make the **data-update pipeline contributor-friendly** — your `scripts/` + `audit:pay-data` setup is a genuine strength; document "how to submit next year's tables" as a first-class workflow.
- Credit contributors visibly (an `AUTHORS` file / README section). Recognition is the currency of OSS.

### 4.4 Governance & the long game — making "community-owned" real

"Shaped by the community" and "blossom into more" only happen if the ownership is *structural*. The license keeps the code in the commons; **governance** keeps the project in the community's hands. Build this in stages — don't over-engineer on day one, but publish the intended path so contributors trust the trajectory.

- **Stage 1 (now): documented benevolent-maintainer.** It's fine for it to be maintainer-led today. What matters is writing a short `GOVERNANCE.md`: how decisions are made, how a contributor becomes a maintainer (e.g., N quality merged PRs → commit access), and how disagreements/data disputes are resolved. Transparency here *is* the community ownership at this stage.
- **Stage 2: a maintainer team + accuracy gate.** Because the product *is* trust, treat **data changes as the highest-governance action**: require the `audit:pay-data` check to pass and a second maintainer's review before any pay/BAH/BAS number merges. Codify this in `GOVERNANCE.md` and PR templates. This is both a quality control and a story you can tell ("no single person can silently change a number").
- **Stage 3: neutral stewardship of the brand and assets.** Today the name, domain, and (eventual) trademark sit with one person. As it grows, **move them to a neutral home** so "community-owned" is literally true and the project survives any one person stepping away. Options, lightest first:
  - **Fiscal host / collective** (Open Collective, Software Freedom Conservancy, or similar) — holds funds and assets for the project without you forming your own nonprofit. Lowest overhead, high legitimacy.
  - **Your own nonprofit** (e.g., a 501(c)(3)) — more work, more control/credibility, worth it only once the project is clearly sustained.
- **Funding without profit.** Non-profit ≠ no costs — hosting and the domain cost money. Set up **transparent, optional donations** (GitHub Sponsors / Open Collective) earmarked for infrastructure, with public ledgers. This funds longevity without compromising the "no profit motive" promise, and a public ledger reinforces trust.

### 4.5 The "blossom into more" question — name your umbrella now

You already ship far more than pay: housing affordability, rent-vs-buy, PCS, TSP/retirement, student loans, deployment, promotion timing. The vision is clearly **"community-owned tools for service-member life,"** not just a pay calculator. Two strategic notes:

- **The name may outgrow itself.** "ActivePayOS" reads as a *pay* tool. If the real mission is the broader toolkit, decide early whether "ActivePayOS" is the umbrella brand or just one tool under a broader community name. Renaming is cheap now and expensive after you've built brand trust. (Not urgent, but decide deliberately rather than by default.)
- **Design the repo/brand to host a family of tools.** Clear module boundaries, a shared data/accuracy layer, and a contributor on-ramp per tool let the community grow the surface area without you gatekeeping every addition — which is exactly how it "blossoms."

---

## 5. Legal risk assessment

> Plain-English, not legal advice. Before launch decisions, have a licensed attorney review §5.2–§5.4. The good news: the scariest-sounding risk (copyright) is the smallest; the manageable ones are branding and disclaimers.

### 5.1 Risk matrix

| Risk | Likelihood | Severity | Net | Mitigation |
|---|---|---|---|---|
| Copyright suit over pay **data** | **Very low** | Low | **Low** | Data is public domain (§2.4); cite it. |
| Copyright suit from **mil-cents / another calculator** | **Very low** | Low–Med | **Low** | Don't copy *their* code/text/design; ship your own. Same data ≠ infringement. |
| **Trademark** — you infringing someone | Low | Med | **Low–Med** | Clearance-search "ActivePayOS"; avoid DoD seals/insignia & service marks. |
| **Impersonation / "looks like a .gov"** | Low–Med | Med–High | **Med** | Prominent non-affiliation disclaimer; no DoD seals; clear "not official" framing. |
| **Liability for a wrong number** someone relied on | Low–Med | Med | **Med** | Strong "estimates/education only, verify with LES/myPay" disclaimer + ToS limitation of liability. |
| **Privacy / data handling** | Low | Med | **Low–Med** | Don't collect PII you don't need; keep calculations client-side; clear privacy policy. |
| **Contributor IP poisoning** (someone PRs copyrighted code) | Low | Med | **Low–Med** | DCO sign-off; review PRs; AGPL provenance. |

### 5.2 Copyright — the one people fear, and why it's small

- **The numbers aren't ownable.** Pay/BAH/BAS tables are U.S. Government works → public domain (`17 U.S.C. § 105`). mil-cents using them gives them no rights; your using them infringes nothing.
- **What *is* protectable** is each site's *original expression* — their specific code, written copy, visual design, and any creative selection/arrangement. **So the rule is simple: don't copy mil-cents' (or anyone's) source code, wording, or layout.** Build your own — which you have. Independently producing the same correct answer from the same public table is not infringement.
- The market is crowded (DFAS, Military.com, Veteran.com, MyBaseGuide, mil-cents, multiple App Store calculators) and there's **no visible history of these tools suing each other.** That's strong real-world signal the copyright risk is low.

### 5.3 Trademark & impersonation — the risk that actually deserves attention

Two directions:

- **Don't infringe / don't impersonate the government.** DoD/Military Department names, seals, insignia, and service marks are protected and **may not be used in commerce without written permission.** Using a DoD seal or implying official endorsement is the genuine danger zone — it can draw a takedown/complaint and looks like impersonation.
  - **Mitigations (you already do some):** keep the prominent _"Not an official DoD/DFAS/military website; not affiliated"_ disclaimer (it's in your README and `/accuracy` — make sure it's on every page footer and the calculator itself). **Do not** use military seals, branch logos, or `.mil`-style trade dress. Be careful with the word "military" in branding — descriptive use ("a military pay calculator") is fine; implying you *are* the military is not.
- **Protect your own brand.** "ActivePayOS" + logo are your moat (§1). You already have common-law rights from use in commerce. Do a quick **trademark clearance search** (USPTO TESS + web) to make sure the name is clear, then consider a federal registration once you're sure you're keeping the name. Publish a `TRADEMARK.md`: "the code is AGPL and free to reuse; the ActivePayOS name and logo are not — a fork must rebrand." This is the sentence that operationally enforces "you can't just rebrand and run."

### 5.4 Inaccurate-information liability — your second real risk

People may make financial/relocation decisions on your numbers. If a number is wrong, the theory of harm is negligent misrepresentation, not copyright.

- **Mitigations (mostly in place — formalize them):**
  - Keep the **"estimates / education and planning only / not financial, tax, or legal advice / verify with your LES, myPay, DFAS"** language — surface it *at the point of calculation*, not just on an About page.
  - A real **Terms of Service** with a limitation-of-liability and "as-is, no warranty" clause (AGPL already disclaims warranty for the *code*; ToS covers *use of the service*). You have `/terms` — make sure it includes this.
  - Your **versioned data + audit script + visible sourcing** are not just marketing; they're your evidence of good-faith diligence if a number is ever disputed.

### 5.5 Could mil-cents (or its community) come after us? — Practical read

- **Legally:** Very weak case. They don't own the data, you didn't copy their code, and competing on the same public information is lawful. The main way you'd create exposure is by literally copying their text/design or scraping their site — **so don't.**
- **Reputationally:** The bigger "risk" is community perception (e.g., r/MilitaryFinance). Being **open, sourced, and accountable** is your best defense and your best differentiator — it's hard to credibly attack the project that shows all its work and invites correction.

---

## 6. Drop-in README "License" replacement (template)

```markdown
## License

ActivePayOS is open source.

- **Code** (everything we wrote — app, components, data-processing scripts,
  schemas, validation, and copy) is licensed under the **GNU Affero General
  Public License v3.0 or later (AGPL-3.0-or-later)**. You are free to use,
  study, modify, and redistribute it. If you run a modified version as a
  network service, AGPL requires you to make your source available to its
  users. See [LICENSE](LICENSE).
- **Reference data** under `data/` originates from U.S. Government sources
  (DFAS, DTMO/MHA) and is in the **public domain** (17 U.S.C. § 105). See
  [NOTICE](NOTICE).
- **Brand:** the names "ActivePayOS," the logo, and activepayos.com are **not**
  covered by the code license. A fork or derivative must use its own name and
  branding. See [TRADEMARK.md](TRADEMARK.md).

ActivePayOS is an educational planning tool. It is **not** an official
Department of Defense, DFAS, or U.S. military website and is not affiliated
with any branch of the U.S. military. It does not provide legal, tax, or
financial advice. Always verify with your LES, myPay, and DFAS.

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
```

---

## 7. Action checklist

**Licensing (do first — unblocks everything):**
- [ ] Decide AGPL-3.0 (recommended) vs Apache-2.0; default to **AGPL-3.0-or-later**.
- [ ] Replace `LICENSE`, update `package.json` license field.
- [ ] Add `NOTICE`/`DATA-LICENSE.md` (public-domain data vs. AGPL original work).
- [ ] Rewrite README License section (template §6); remove the "no copying" paragraph.

**Community / contributors:**
- [ ] Add `CONTRIBUTING.md` (DCO `-s` sign-off — no CLA), `CODE_OF_CONDUCT.md`, `SECURITY.md`.
- [ ] Publish a roadmap + 5–10 scoped "good first issue"s.
- [ ] Add `AUTHORS` / contributor credit.

**Governance / community ownership (the "blossom" path):**
- [ ] Add `GOVERNANCE.md`: decision-making, how to become a maintainer, dispute resolution.
- [ ] Codify the **accuracy gate**: `audit:pay-data` must pass + second-maintainer review for any data-number change.
- [ ] Set up transparent, optional donations for infra (GitHub Sponsors / Open Collective).
- [ ] Decide the **umbrella-brand question** (is "ActivePayOS" the family name or one tool?) before brand trust compounds.
- [ ] Plan Stage-3 neutral stewardship (fiscal host or nonprofit) for when growth justifies it.

**Brand / legal:**
- [ ] Trademark clearance search on "ActivePayOS"; add `TRADEMARK.md`.
- [ ] Audit the whole site for DoD seals/insignia → remove any.
- [ ] Put the non-affiliation + "estimates only, verify with LES/myPay" disclaimer on every page footer **and** in the calculator UI.
- [ ] Have a lawyer review `/terms` for limitation-of-liability + as-is warranty.
- [ ] Confirm no third-party (incl. mil-cents) code/copy/design was copied.

**Positioning:**
- [ ] Make "every number is sourced & versioned" a front-page promise.
- [ ] Publish a public data changelog.
- [ ] Engage (helpfully) in r/MilitaryFinance and adjacent communities.

---

### Appendix — Sources consulted
- 17 U.S.C. § 105 (U.S. Government works / public domain) — https://www.law.cornell.edu/uscode/text/17/105
- DFAS 2026 pay tables — https://www.dfas.mil/MilitaryMembers/payentitlements/Pay-Tables/
- DoD trademark/seal use guidance — https://dodcio.defense.gov/Home/PublicUseNotice/ and https://www.trademark.af.mil
- AGPL vs MIT/Apache for web apps & the SaaS loophole — https://plausible.io/blog/open-source-licenses ; https://www.getmonetizely.com/articles/should-you-license-your-open-source-saas-under-agpl-or-mit-a-decision-guide-for-founders
- Competitor reference — https://mil-cents.com/calculator
