# Contributing to ActivePayOS

ActivePayOS is **open source and community-owned**, and we would love your help.
This is a non-profit public good for the military community — there is no profit
motive, and the goal is for the **community to help drive its development**
alongside the maintainers.

Whether you write code, check numbers, fix a typo, or just have an idea — you are
welcome here.

## Ways to help

- **Report a bug or a wrong number.** Open an issue: <https://github.com/nickparker52/ActivePayOS/issues/new>
- **Suggest a feature or a new calculator.** Open an issue and describe the use case.
- **Write code.** Pick up an open issue (look for `good first issue`), or propose a
  change in an issue first, then open a pull request.
- **Improve the data accuracy layer.** New pay/BAH/BAS years, edge cases, and
  source citations are especially valuable.

## Development

```bash
git clone https://github.com/nickparker52/ActivePayOS.git
cd ActivePayOS
npm install
npm run dev
```

Before opening a pull request, please run:

```bash
npm run audit:pay-data
npm run lint
npm run build
```

## Pull requests

- Keep PRs focused, and describe the change and why.
- For any change to a pay / BAH / BAS **number**, cite the official source and make
  sure `npm run audit:pay-data` passes. Data accuracy is the highest bar in this
  project — people make real money decisions on it.

## Developer Certificate of Origin (DCO)

We use the DCO instead of a CLA. By signing off your commits you certify that you
wrote the change, or otherwise have the right to submit it under the project
license. Sign off each commit:

```bash
git commit -s -m "Your message"
```

This adds a `Signed-off-by: Your Name <you@example.com>` line. No copyright is
assigned to anyone — your contribution stays in the commons under
AGPL-3.0-or-later, and nobody (including the maintainers) can take it private.

## License

By contributing, you agree that your contributions are licensed under the
project's license, **AGPL-3.0-or-later**. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

## Code of conduct

Be decent and constructive. We are building something useful for service members —
keep it welcoming. Harassment or abuse is not tolerated.
