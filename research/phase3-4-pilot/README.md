# Phase 3.4 Modern Reading Content Pilot

This is a manual, isolated research pilot. Nothing here is imported by the frontend or added to the active Reading Library.

## Scope and evidence

The manifest contains eight publisher-listed candidates: two PLOS ONE research articles and six VOA Learning English RSS records. PLOS article pages were inspected on 2026-10-03. Each inspected page states that the article is published under the Creative Commons Attribution License (CC BY 4.0); item-level evidence, attribution, author/title/date/DOI, and exclusions are recorded per item. Only the abstracts are retained as UTF-8 text to validate normalization. No figures, tables, supplementary files, photos, maps, or other media are retained.

The PLOS ONE source entry in the Phase 3.3 registry remains `unknown` / `link-only`. The manifest records that baseline unchanged. Its isolated pilot decision uses the explicit CC BY 4.0 statement on each individual PLOS article page; this is not a change to the registry or to `sourceValidation.ts`. A source marked `restricted` or `not-allowed` remains a hard veto in the pilot validator.

Six VOA items were taken from the verified official RSS feed on 2026-10-03. The RSS link, title, GUID, and publication timestamp are recorded. The feed did not provide authors for these entries. VOA's official terms distinguish exclusive VOA-produced material from third-party licensed material; because these individual items were not cleared as exclusively VOA-produced, the pilot retains metadata and links only. The source remains `partially-verified` / `metadata-only`; no story body was fetched.

No CEFR level is assigned. The pilot's content type and subject categories are explicit human classifications where present, not AI-generated. Missing evidence stays null or unassigned.

## Files

- `pilot-manifest.json`: item records, evidence, rights decisions, and source-policy snapshots.
- `pilot-summary.md`: counts, exclusions, and unresolved questions.
- `content/`: only the two licensed abstracts, plain UTF-8 text.
- `scripts/pilot-validation.mjs`: dependency-free manifest and rights validation.
- `scripts/pilot-tests.mjs`: deterministic fixture and manifest tests.

## Re-run checks

From this directory, run:

```powershell
node scripts/pilot-tests.mjs
```

Existing application checks remain separate and unchanged. The pilot test does not fetch the network and adds no package dependency or npm script. The live VOA RSS request was a separate manual metadata-only experiment; its actual feed `lastBuildDate` is recorded in the manifest. The PLOS web fetches were used to inspect item license statements and metadata; only the abstract text was retained.

This pilot is not legal advice. Rights statements are documented evidence for review, not a definitive legal determination. Any future reuse should re-check the source page and item license, especially for embedded third-party assets.
