# Phase 3.5 - Controlled Content Intake

This directory contains an isolated, dependency-free intake schema, validator,
fixtures, workflow, and tests. It is not imported by the application and does
not publish or move records into the Reading Library.

## Run

From this directory:

```powershell
node scripts/intake-tests.mjs
node scripts/validate-intake.mjs --input fixtures/valid --policies fixtures/source-policies
```

The validator exits with code 1 when an input has validation errors. To inspect
the deliberately invalid fixture, run:

```powershell
node scripts/validate-intake.mjs --input fixtures/invalid --policies fixtures/source-policies
```

The CLI reads only the local JSON files passed to it. It does not fetch,
resolve, or verify URLs over the network. Its output reports evidence present
in the record; it does not establish the truth or legal effect of a license.
No input is repaired or automatically approved.

## Model boundaries

The pipeline has its own vocabulary. Its `rightsStatus` uses the Phase 3.3
status names (`verified`, `partially-verified`, `unknown`, `restricted`,
`not-allowed`); `reuseMode` distinguishes item outcomes (`verified-full-text`,
`metadata-only`, `link-only`, `unknown`, `restricted`). The source-policy
`maxReuseMode` uses that same intake reuse vocabulary. Content type, group, and
category values are an independent snapshot of the existing metadata
vocabulary documented in `docs/validation-rules.md`; no app type is imported or
changed.

Source policy is an additional hard constraint when registered, not a
prerequisite for evaluating an item. Without a policy, full-text still requires
verified article-level public-domain, reusable-license, or documented-
permission basis with captured evidence and required attribution. License
basis additionally requires the actual item license URL/type/identifier.
Registered source ceilings and restrictions cannot be overridden. The PLOS
and VOA policy fixtures preserve the Phase 3.4/3.3 baselines. A separate
synthetic source fixture exists only to exercise a valid full-text case in
tests; it is not a real source or evidence. Unverified/malformed media receives
omission warnings and does not block otherwise eligible text.

See `docs/workflow.md` for review states and `docs/validation-rules.md` for
validation behavior and stable error codes. Approval means only that this
validator found no internal rule violations; it is not a legal certification
and does not trigger publication.
