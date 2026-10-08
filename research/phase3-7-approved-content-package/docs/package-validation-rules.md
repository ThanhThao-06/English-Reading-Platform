# Package validation and eligibility rules

The package validator uses only the supplied package, local policy fixtures,
and provenance. It never fetches URLs or changes rights/status data.

## Eligibility gates

A candidate is eligible only when all of these hold:

1. It matches the closed package schema and required content, source, rights,
   validation, review, and provenance structures.
2. Content identity and title are present. Content type, group, language, and
   source URL may remain null when absent. Source name, canonical article URL,
   body, and the reviewed Library presentation metadata are required. No
   values are guessed.
3. The source identity is recorded. A local source policy is optional; if
   present, requested reuse must not exceed its ceiling and
   restricted/not-allowed policies veto. Without a policy, item-level evidence
   must independently support the requested reuse.
4. Item rights status and permitted reuse mode are compatible. Rights evidence
   identifies the type, URL/reference, date if recorded, scope, and record to
   which it applies. Full-text requires item-level `public-domain`, `license`,
   or `permission` basis with evidence and applicable attribution. License
   basis also requires the exact item license URL/type/identifier. Source-level
   permission, source presence, URLs and external IDs do not replace item
   evidence. The conditional publisher grant below remains a separately
   verified source-policy rule.
5. Required attribution is non-empty. A body or body reference exists only
   with verified full-text rights and an allowed source policy; metadata-only,
   link-only, unknown, and restricted packages cannot carry body content.
6. Intake validation result is PASS and its error list is empty; Phase 3.6
   result is PASS and ready for Phase 3.7 review; no `BLOCKED` or
   `REVIEW_REQUIRED` record is promoted.
7. Human review status is `approved` in the Phase 3.5 intake record, with
   review decision recorded. `needs-*`, `received`, and `rejected` are not
   eligible.
8. Provenance links original/source record ID, intake record and schema
   version, Phase 3.5 validation, Phase 3.6 record result, review status,
   source manifest, and package creation timestamp.
9. There are no duplicate record IDs, source/external ID pairs, DOI values,
   canonical URLs, or packageId/version pairs in the package batch.
10. Synthetic test data is never production-eligible and is never written to
    the approved-content output directory.

Any failed gate yields `NOT_ELIGIBLE` (or `REJECTED` for an explicit rejection)
and `eligibleForPhase38: false`. The builder rejects ineligible, blocked,
review-required, evidence-incomplete, policy-violating, duplicate, or
provenance-incomplete candidates before writing.

## Conditional publisher grant (carried from Phase 3.5)

The validator reuses `phase3-5-content-intake/scripts/conditional-full-text-grant.mjs`
so a VOA-produced Learning English package does not need a separate per-article
license document at package level either. The package must still carry
source-policy evidence scoped to the source, item-scoped metadata evidence, the
official credit line, an approved human review, and full provenance.

- Granted: `rights.license` may be null and `item-license` evidence may be absent.
- Not granted: the original item-scoped license requirement applies unchanged,
  and `PACKAGE_CONDITIONAL_RIGHTS_NOT_MET` reports the unmet conditions.
- Third-party attribution (AP/Reuters/AFP/etc.) yields
  `PACKAGE_THIRD_PARTY_CONTENT_BLOCKED`; the package can never be eligible, and
  a restricted source policy still vetoes.

## Stable validation codes

| Code | Meaning |
| --- | --- |
| `PACKAGE_SCHEMA_INVALID` | Required structure, type, enum, URL, or declared property is invalid. |
| `PACKAGE_SOURCE_MISSING` | Source identity is absent, or a synthetic policy is used in production mode. |
| `PACKAGE_POLICY_RESTRICTED` | Source policy is restricted/not-allowed. |
| `PACKAGE_POLICY_EXCEEDED` | Requested reuse exceeds source policy. |
| `PACKAGE_RIGHTS_INSUFFICIENT` | Rights status/mode is insufficient for the package content. |
| `PACKAGE_RIGHTS_BASIS_REQUIRED` | Full-text package has no valid item-rights basis. |
| `PACKAGE_EVIDENCE_REQUIRED` | Required evidence is absent, wrong scope, or does not apply to this record. |
| `PACKAGE_CONDITIONAL_RIGHTS_NOT_MET` | A conditional full-text grant exists for this source but its per-package conditions are unmet. |
| `PACKAGE_THIRD_PARTY_CONTENT_BLOCKED` | Third-party copyrighted content is present; the publisher-domain policy cannot override it and the package is ineligible. |
| `PACKAGE_ATTRIBUTION_REQUIRED` | Required attribution is absent. |
| `PACKAGE_BODY_NOT_ALLOWED` | Body/reference is present without verified, policy-permitted full-text reuse. |
| `PACKAGE_METADATA_INCOMPLETE` | Required content/source metadata is absent. |
| `PACKAGE_INTAKE_NOT_PASS` | Intake validation is not PASS or has errors. |
| `PACKAGE_DRY_RUN_NOT_PASS` | Phase 3.6 result is not PASS/ready. |
| `PACKAGE_REVIEW_INCOMPLETE` | Human review is not complete/approved or has no decision. |
| `PACKAGE_PROVENANCE_INCOMPLETE` | A required provenance link is absent or inconsistent. |
| `PACKAGE_DUPLICATE_RECORD_ID` | Source record ID occurs more than once. |
| `PACKAGE_DUPLICATE_EXTERNAL_ID` | Source ID and external ID pair repeats. |
| `PACKAGE_DUPLICATE_DOI` | DOI repeats after normalization. |
| `PACKAGE_DUPLICATE_CANONICAL_URL` | Canonical URL repeats after safe normalization. |
| `PACKAGE_DUPLICATE_VERSION` | Package ID/version pair repeats. |
| `PACKAGE_SYNTHETIC_NOT_ELIGIBLE` | Test-only synthetic input cannot be emitted as a real package. |
| `PACKAGE_OVERWRITE_REFUSED` | Target package version already exists; version must be advanced. |

Duplicate title is not an automatic match; it may be presented for human review
outside automatic identity checks. Intake dry-run and package construction
return per-record outcomes, so a skipped/rejected record does not prevent later
records from being evaluated. Missing/unclear rights and required metadata are
`SKIPPED`; explicit policy restrictions, invalid data, and duplicates are
`REJECTED`. Unsafe images are omitted and reported as warnings rather than
blocking safe text.

## Current policy snapshots

- PLOS ONE: `unknown` / `link-only`. Item-specific Phase 3.4 rights statements
  do not override the source policy. No PLOS full-text package is eligible.
- VOA Learning English: `partially-verified` / `metadata-only`. The six Phase
  3.4 records have no verified canonical URL; none is eligible for a content
  package in this run.

All checks are local. This validation is not a legal determination.
