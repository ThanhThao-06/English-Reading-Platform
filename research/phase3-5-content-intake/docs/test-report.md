# Phase 3.5 validation report

Commands and outcomes below are recorded from the execution environment; no
result is inferred.

## Scope and results

| Check | Command | Result |
| --- | --- | --- |
| Phase 3.5 tests | `node scripts/intake-tests.mjs` | PASS - 17 scenarios, 30 assertions |
| Valid fixture set | `node scripts/validate-intake.mjs --input fixtures/valid --policies fixtures/source-policies` | PASS - 2 records, 0 errors |
| Invalid fixture expectation | `node scripts/validate-intake.mjs --input fixtures/invalid --policies fixtures/source-policies` | PASS - validator exited 1 as expected; `BODY_NOT_ALLOWED` on the synthetic invalid record |
| Frontend npm tests | `npm test` in an isolated temporary copy of `frontend` package scripts and source | PASS - chapters: 120 assertions; SRS: 99 assertions |
| Metadata regression | Existing `metadataTests.ts`, compiled outside `.tmp-test` | PASS - 750 assertions |
| Source regression | Existing `sourceTests.ts`, compiled outside `.tmp-test` | PASS - 637 assertions |
| Typecheck | `tsc --project tsconfig.app.json --noEmit` and `tsc --project tsconfig.node.json --noEmit` | PASS |
| Lint | `npm run lint` (in `frontend`) | PASS |
| Production build | Existing Vite configuration, `vite build --outDir ..\research\phase3-5-content-intake\.tmp-build-output --emptyOutDir` | PASS - 60 modules transformed; output was isolated and then removed |

The frontend package has no dedicated `typecheck` script. Its `build` script
runs `tsc -b` before Vite. To preserve the already-populated
`frontend/scripts/.tmp-test` and existing `frontend/dist`, the same frontend
package scripts and source were copied to a temporary Phase 3.5 location for
`npm test`, regression output was compiled to a separate temporary Phase 3.5
location, and Vite output was directed to a temporary Phase 3.5 location.
These temporary paths were removed after the checks. The app typecheck was run
with both existing TypeScript project configurations in no-emit mode; the
production bundle was built using the existing Vite configuration.

## Scope confirmations and limitations

- All deliverable files are new and confined to `research/phase3-5-content-intake/`.
- No frontend source, package manifest, lockfile, article/chapter data, selectors,
  or source registry file was edited.
- The Phase 3.4 pilot was not imported into the app; no publishing or automatic
  library transfer was implemented.
- No network requests, crawlers, external APIs, or AI services were used by
  this pipeline or its tests.
- The PLOS and VOA source policy snapshots remain `unknown`/`link-only` and
  `partially-verified`/`metadata-only`, respectively. Full-text success uses
  only synthetic fixtures.
- The validator checks only supplied data and syntactic URL shape. It cannot
  authenticate evidence or certify legal rights.
- Git status/diff verification was not possible because the workspace is not a
  Git repository.

The existing `.tmp-test` and `dist` contents were preserved.
