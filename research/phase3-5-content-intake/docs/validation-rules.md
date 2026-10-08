# Validation rules

The schema in `schemas/intake-record.schema.json` specifies field types,
required identity/review fields, closed enums, optional verified metadata,
item-rights fields, and separately assessed media. `scripts/validate-intake.mjs`
implements the checks below without dependencies or network access. It checks
the input and reports errors; it never normalizes or repairs the input itself.

## Data model and vocabulary

- `recordId`, `sourceId`, `title`, `canonicalUrl`, `receivedAt`,
  `rightsStatus`, `reuseMode`, `attributionRequired`, `mediaAssets`, and
  `reviewStatus` are required.
- Authors and publication date are optional and are recorded only when
  verified. Unknown metadata is omitted, not guessed.
- `rightsStatus` reuses Phase 3.3 status labels. Intake `reuseMode` makes the
  item decision explicit (`verified-full-text`, `metadata-only`, `link-only`,
  `unknown`, `restricted`). This is an independent model, not an app import.
- `contentType`, `contentGroup`, and categories mirror the existing Phase 3.2
  values to ease human mapping. The validator does not assign classifications.
- Each media asset has its own rights status and a `retain`/`exclude`
  disposition. Excluded unverified assets may be represented for audit, but
  are not package content.

## Checks

1. Check JSON record shape, required fields, types, enums, and unexpected keys.
2. Accept only absolute HTTP(S) URLs without whitespace or embedded
   credentials. URL comparison lowercases scheme/host, uses URL-parser
   canonicalization (including default ports), and discards fragments.
   Query strings and path case are preserved. No URL is contacted.
3. Reject duplicate canonical URLs after that conservative normalization;
   reject repeated record IDs; detect DOI duplicates case-insensitively after
   stripping a `doi:` or DOI resolver prefix. External IDs are case-insensitive
   after trimming and are unique within the same source.
4. Dates must be real `YYYY-MM-DD` calendar dates. Dates before 1800,
   receipt dates in the future, and a publication date later than receipt are
   unreasonable.
5. A local source policy is optional for evaluating an item. When one exists,
   its reuse ceiling remains binding and `restricted`/`not-allowed` policies
   veto reuse, regardless of item evidence. Without a local policy, full-text
   still requires verified item rights, an item license URL/type/identifier,
   rights evidence, and required attribution. Missing or unclear item-rights
   evidence is skipped, not treated as permission. The PLOS and VOA fixtures
   preserve their existing baselines (`unknown`/`link-only`,
   `partially-verified`/`metadata-only`); VOA's existing conditional grant
   continues to apply only under its recorded conditions. The synthetic open
   policy is test data only.
6. A source policy may declare an optional `conditionalFullText` grant block.
   The grant is **additive**: it never removes the source-policy check, never
   overrides a `restricted`/`not-allowed` policy, and applies only to the one
   source named by the policy that declares it. See the next section.
7. Body is allowed only for verified item rights and
   `verified-full-text`. Full text requires an explicit article-level rights
   basis (`public-domain`, `license`, or `permission`), a rights evidence URL
   and captured statement, and a non-empty body. A license basis additionally
   requires its item license URL, type, and identifier. Public-domain and
   documented-permission evidence do not require a separate license document.
   The existing conditional publisher grant remains an independent,
   evidence-bound exception for its declared source. `metadata-only`,
   `link-only`, `unknown`, restricted, and unverified rights may not include
   body text.
8. When item evidence says attribution is required, the text must be non-empty.
   This records supplied evidence; it does not verify that the statement is
   accurate or legally sufficient.
9. Media included in a package needs `verified` rights and its own evidence
   URL. Required media attribution must be non-empty. An unverified asset,
   missing evidence, or missing required credit receives an omission warning
   rather than blocking otherwise eligible text. Package construction omits
   the image unless the exact referenced asset passes these checks.
10. Rejected records require rejection reasons. An `approved` record with any
    validation error receives `APPROVAL_BLOCKED`; no status is changed.
11. Every issue includes `code`, `message`, `field`, `severity`, and `recordId`.
    Batch output includes `valid`, `errors`, `warnings`, and a count summary.

## Conditional full-text grant (VOA Learning English)

`scripts/conditional-full-text-grant.mjs` implements one narrow, evidence-based
rule. The official VOA Learning English reuse policy
(<https://learningenglish.voanews.com/p/6861.html>) places Learning English
material **produced by VOA** in the public domain, reprintable with credit to
`learningenglish.voanews.com`, and separately excludes copyrighted AP, Reuters,
AFP and other agency material. The grant encodes that policy rather than
inventing a licence:

```text
official VOA reuse policy
  + canonical URL on learningenglish.voanews.com
  + byline/author credit identifying VOA Learning English or VOA
  + no AP / Reuters / AFP / other third-party copyright attribution
  + rightsEvidenceUrl on the approved host with the captured policy statement
  + attributionRequired true with the official credit line
  => verified full-text reuse, with no separate per-item license document
```

Rules the grant deliberately does **not** weaken:

- The source-policy ceiling check still runs; the grant only raises the
  effective ceiling for a record that independently satisfies every condition.
- `restricted`/`not-allowed` still veto.
- A `synthetic: true` policy may not carry a grant at all
  (`SOURCE_POLICY_INVALID`).
- Third-party attribution is a hard block that also emits the stable
  `SOURCE_POLICY_EXCEEDED` code; a VOA domain can never override another
  publisher's copyright.
- Attribution surfaces scanned are `authors`, `title`, and `attributionText`.
  `rightsEvidenceExcerpt` is deliberately **not** scanned, because the official
  policy statement itself names AP, Reuters and AFP. Article-body credit review
  remains a human step recorded as `reviewStatus: rejected` with reasons.
- The bare token "AP" is only matched in unambiguous credit forms (`(AP)`,
  `AP Photo`, `AP News`, `AP wire`), because VOA Learning English itself
  publishes an "AP English" course series.

## Stable issue codes

| Code | Meaning |
| --- | --- |
| `SCHEMA_RECORD_TYPE` | Record or batch has the wrong structural type. |
| `SCHEMA_REQUIRED_FIELD` | A required record field is missing; missing Library metadata is skipped for later completion. |
| `SCHEMA_FIELD_TYPE` | A field has the wrong JSON type or empty required value. |
| `SCHEMA_ENUM` | A vocabulary value is not supported or violates uniqueness. |
| `SCHEMA_UNKNOWN_FIELD` | An undeclared field was supplied. |
| `URL_INVALID` | URL is malformed, non-HTTP(S), contains whitespace, or has credentials. |
| `URL_DUPLICATE` | Canonical URL repeats after safe normalization. |
| `IDENTIFIER_DUPLICATE` | DOI or source-scoped external ID repeats. |
| `DUPLICATE_RECORD_ID` | `recordId` repeats in the batch. |
| `DATE_INVALID` | Date is not a real `YYYY-MM-DD` date. |
| `DATE_UNREASONABLE` | Date is before 1800 or publication follows receipt. |
| `SOURCE_POLICY_INVALID` | Policy is malformed, duplicated, or claims full-text without verified source rights. |
| `SOURCE_POLICY_RESTRICTED` | Restricted/not-allowed policy vetoes requested reuse. |
| `SOURCE_POLICY_EXCEEDED` | Item asks for broader reuse than the policy ceiling. |
| `BODY_NOT_ALLOWED` | Body exists outside verified full-text mode and rights. |
| `RIGHTS_STATUS_INSUFFICIENT` | Full text requested without verified item rights status. |
| `ITEM_RIGHTS_RESTRICTED` | Item rights or requested reuse explicitly prohibits reuse. |
| `RIGHTS_BASIS_REQUIRED` | Full text has no recorded item-level rights basis. |
| `ITEM_RIGHTS_EVIDENCE_REQUIRED` | Required item evidence URL or captured statement is absent (a granted conditional publisher grant waives only the separate item licence document). |
| `FULL_TEXT_LICENSE_REQUIRED` | A license-based full-text claim lacks its license URL, type, or identifier. |
| `CONDITIONAL_RIGHTS_NOT_MET` | A conditional full-text grant exists for this source but its per-item conditions are unmet. |
| `THIRD_PARTY_CONTENT_BLOCKED` | Third-party copyrighted content (AP/Reuters/AFP/etc.) is present; a publisher-domain policy cannot override it and the record must be rejected. |
| `ATTRIBUTION_REQUIRED` | Required full-text attribution is absent. |
| `FULL_TEXT_BODY_REQUIRED` | Verified full-text record has no non-empty body. |
| `ASSET_OMITTED_UNVERIFIED` | Warning: media with unclear rights is omitted; parent text remains eligible. |
| `ASSET_OMITTED_EVIDENCE_MISSING` | Warning: media without valid evidence is omitted; parent text remains eligible. |
| `ASSET_OMITTED_ATTRIBUTION_MISSING` | Warning: media without required credit is omitted; parent text remains eligible. |
| `ASSET_OMITTED_INVALID` | Warning: malformed/unsupported media metadata is omitted. |
| `ASSET_OMITTED_DUPLICATE` | Warning: ambiguous duplicate asset reference is omitted. |
| `ASSET_OMITTED_METADATA_MISSING` | Warning: no media metadata was supplied. |
| `REJECTION_REASON_REQUIRED` | Rejected record has no reason. |
| `APPROVAL_BLOCKED` | Approved status conflicts with one or more validation errors. |

Each record reports `PASS`, `SKIPPED`, or `REJECTED`. Rights/metadata gaps
skip the candidate; explicit restrictions, malformed records, duplicates, and
third-party content reject it. Warnings describe omitted media and do not
change text eligibility.

## Evidence and legal limits

Fixtures containing `example.invalid`, synthetic identities, placeholder
license statements, or synthetic policies are invented test data and not
evidence. The PLOS/VOA policy snapshots are copied as unchanged local policy
values, not re-verified here. This validator assesses only fields supplied by
the caller; it does not decide whether a license applies, whether a URL works,
or whether a reuse is lawful.
