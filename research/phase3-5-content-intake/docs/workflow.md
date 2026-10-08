# Intake and review workflow

This is a human-operated, isolated workflow. The validator checks a snapshot; it
does not advance a record, fetch a source, make a legal determination, or
publish anything.

## States and transitions

Allowed forward transitions:

```text
received
  -> needs-source-review
  -> needs-rights-review
  -> needs-quality-review
  -> approved

Any non-terminal review state -> rejected
```

Returning to an earlier review state is permitted when new evidence changes
what needs review. `approved` and `rejected` are terminal for this intake run;
reconsideration starts a separately documented review rather than silently
rewriting the decision. Record state changes are explicit human actions; the
validator does not perform transitions.

| State | Entry condition | Exit condition |
| --- | --- | --- |
| `received` | A record has its identity, source, canonical URL, receipt date, rights/reuse fields, media list, and initial status. Missing source evidence is allowed as unresolved; prohibited body text is not. | Route to source review when the source identity/policy is missing, stale, or unclear; otherwise route to rights review. |
| `needs-source-review` | The source identifier is unresolved, a source ceiling/caveat needs review, or no local policy exists and item rights are not yet established. | A reviewer records/updates a policy from actual reviewed evidence, or records sufficient item-level rights evidence where no policy is registered, then routes to rights review. Do not infer permission from access, RSS, an API, or a public page. |
| `needs-rights-review` | Item rights are unknown, partial, not evidenced at item level, or conflict with the source policy. | A reviewer records item-level license/evidence and required attribution, keeps the content within the source ceiling, and routes to quality review; otherwise reject or retain only allowed metadata/link fields. |
| `needs-quality-review` | Source and rights checks are complete for the requested reuse mode and any retained media has separately verified rights. | A reviewer checks metadata/content quality, exclusions and evidence traceability; approve only if the validator reports no errors, or reject with reasons. |
| `approved` | Human reviewer requests final status after source, item-rights, and quality reviews; no validation errors remain. | Terminal for this intake run. It means only that the internal checks passed, not legal certainty, and never publishes or transfers content. |
| `rejected` | A reviewer declines the record, with one or more `rejectionReasons`. | Terminal for this intake run. Reconsideration needs a new documented review. |

## Evidence and content handling

Unknown fields remain absent; do not fill authors, dates, identifiers, license
URLs, attributions, or other evidence by guess. A record without item evidence
may remain in a review queue when its body is absent and its reuse mode obeys
the source policy.

Only `rightsStatus: verified` together with `reuseMode: verified-full-text`,
valid item-level license/evidence fields, required attribution, and no
conflicting registered source policy can contain `body`. A registered source
policy ceiling remains binding; a policy is not a prerequisite when sufficient
item-level evidence exists. Media is independent of text eligibility. Assets
without verified rights, valid evidence, or required credit produce omission
warnings and are excluded during package construction rather than blocking
otherwise eligible text.

`approved` is a review status, not a publication command. Keep all records and
fixtures in this research directory; no app/library integration is part of
Phase 3.5.
