# Transaction safety and rollback

## Production boundary

There is no production transaction adapter in this phase. The static Library
bundle has no append/update interface, and its localStorage modules store user
progress rather than article records. The command-line `IMPORT` mode therefore
never writes content; it reports `IMPORT_BLOCKED` whenever a package needs a
writer. The present run has no package candidates, so import count is zero.

## Simulated transaction contract

Tests exercise an in-memory-only adapter with four operations:

1. `snapshot()` captures the complete current in-memory Library representation.
2. Every package is validated, mapped, and duplicate-checked before any write.
3. `writeBatch(records)` receives the full prepared batch only after all checks
   pass; the test adapter may simulate a write that partially fails.
4. On write or verification failure, `restore(snapshot)` is called and
   `readAll()` is compared to the snapshot. A failed restore is surfaced as
   `ROLLBACK_FAILED`; it is never reported as a successful import.

This contract tests sequencing and rollback logic only. It is not wired to
filesystem, app storage, frontend code, or a database, and it is not a promise
that the current static app can provide atomic imports.

## Invariants

- A preflight failure means zero write calls.
- A batch is checked in full before its first write.
- Exact duplicates are skipped; possible duplicates require review; there is no
  automatic merge.
- A write failure attempts restoration and verifies the restored snapshot.
- Dry runs never call a write or restore operation.
- No phase status, source policy, licence assertion, or review result is
  upgraded automatically.
