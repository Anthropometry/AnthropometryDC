# Anthro Collect

A **student research project at Ashesi University**. Anthro Collect is a field data-collection
app: tailors and field agents in Ghana use it to record consent, tape measurements and photos.
The data will train a model that estimates body measurements from photos.

It is a PWA shared as a link (Android Chrome and iPhone Safari → Add to Home Screen).
Collectors sign in with a phone number and a 6-digit PIN; there is no email anywhere.

## Privacy

- **No participant data is in this repository**: no names, measurements, photos or phone numbers.
  Phone numbers in tests are made-up examples.
- **Faces are blurred on the phone** before a photo is saved or uploaded; an unblurred face is
  never stored. Names live only in a restricted consent table that collectors cannot read back.
- Real collection stays switched off until ethics (IRB) approval.

Details: [docs/SECURITY.md](docs/SECURITY.md).

## Run locally

```bash
npm install
cp .env.example .env.local        # fill in the public Supabase values
cp .dev.vars.example .dev.vars    # same values for the Worker
npm run dev                       # app only
npm test                          # all tests
npm run preview:worker            # app + /api via wrangler dev
```

Stack and commands: [docs/TECH_STACK.md](docs/TECH_STACK.md) · tests: [docs/TESTING.md](docs/TESTING.md).

## CI/CD

Every pull request runs typecheck, lint, tests with a coverage gate, database-rule tests,
`npm audit`, a secret scan and a build, then posts a preview link. A merge to `main` runs the
same checks, waits for approval, then deploys the Cloudflare Worker. See
[.github/workflows](.github/workflows) and the CI/CD section of
[docs/NORTH_ANCHOR.md](docs/NORTH_ANCHOR.md).

## Project rules and plan

- [POLICY.md](POLICY.md): rules every change follows
- [docs/ROADMAP.md](docs/ROADMAP.md): milestones and checklists
- [docs/SECURITY.md](docs/SECURITY.md): security and privacy controls
- [DISCUSSION.md](DISCUSSION.md): decisions, newest first

## Contact

Patience Sombang: [github.com/Patience3](https://github.com/Patience3)
