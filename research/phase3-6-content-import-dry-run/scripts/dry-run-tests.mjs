import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DRY_RUN_ROOT,
  generateDryRun,
  getOutputPaths,
  generateIntakeDryRun,
  mapPilotRecord,
  renderMarkdownReport,
} from './dry-run.mjs';
import { validateIntake as validateActualIntake } from '../../phase3-5-content-intake/scripts/validate-intake.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_ROOT = resolve(ROOT, '..', '..');
const manifest = JSON.parse(readFileSync(resolve(PROJECT_ROOT, 'research', 'phase3-4-pilot', 'pilot-manifest.json'), 'utf8'));
const intakeRoot = resolve(PROJECT_ROOT, 'research', 'phase3-5-content-intake');
const policies = ['plos-one.json', 'voa-learning-english.json', 'synthetic-open-source.json', 'synthetic-metadata-source.json']
  .map((name) => JSON.parse(readFileSync(resolve(intakeRoot, 'fixtures', 'source-policies', name), 'utf8')));
const reportPath = resolve(ROOT, 'reports', 'dry-run-report.md');
const resultsPath = resolve(ROOT, 'reports', 'dry-run-results.json');
const checks = { passed: 0 };
const check = (condition, message) => {
  checks.passed += 1;
  assert.ok(condition, message);
};

const result = generateDryRun(manifest, policies);

check(manifest.records.length === 8, 'all eight Phase 3.4 records must be discovered');
check(result.summary.recordsProcessed === 8, 'all discovered records must be processed');
check(result.recordResults.filter((record) => record.sourceId === 'plos-one').length === 2, 'both PLOS records are included');
check(result.recordResults.filter((record) => record.sourceId === 'voa-learning-english').length === 6, 'all six VOA records are included');

const plos = manifest.records.find((record) => record.sourceId === 'plos-one');
const mappedPlos = mapPilotRecord(plos);
check(mappedPlos.recordId === plos.id && mappedPlos.title === plos.title, 'record identity/title mapping is preserved');
check(mappedPlos.reuseMode === 'verified-full-text', 'Phase 3.4 item intent is not silently downgraded');
check(mappedPlos.canonicalUrl === plos.canonicalUrl, 'PLOS canonical URL mapping is preserved');
check(!Object.hasOwn(mappedPlos, 'body'), 'Phase 3.4 abstract is never copied as intake body');
check(mappedPlos.rightsEvidenceUrl === plos.itemLicense.evidenceUrl, 'item-level evidence URL maps from the pilot record');

const voa = manifest.records.find((record) => record.sourceId === 'voa-learning-english');
const mappedVoa = mapPilotRecord(voa);
check(mappedVoa.reuseMode === 'metadata-only', 'VOA reuse remains metadata-only');
check(mappedVoa.rightsStatus === 'partially-verified', 'VOA rights remain partially verified');
check(mappedVoa.canonicalUrl === null, 'unverified VOA canonical URL remains null');
check(mappedVoa.publishedAt === voa.publishedAt.slice(0, 10), 'UTC publication timestamp is reduced to schema date without inventing a date');
check(!Object.hasOwn(mappedVoa, 'authors'), 'absent VOA authors are not fabricated');
check(!Object.hasOwn(mappedVoa, 'body'), 'no VOA body is mapped');

let validatorCalls = 0;
let validatorRecords = [];
let validatorPolicies = [];
generateDryRun(manifest, policies, (records, policySet) => {
  validatorCalls += 1;
  validatorRecords = records;
  validatorPolicies = policySet;
  return validateActualIntake(records, policySet);
});
check(validatorCalls === 1, 'Phase 3.5 validator entry point is called once for the whole batch');
check(validatorRecords.length === 8, 'the validator receives all eight mapped records');
check(validatorPolicies === policies, 'the validator receives the unchanged local Phase 3.5 policy set');

check(policies.find((policy) => policy.sourceId === 'plos-one').rightsStatus === 'unknown'
  && policies.find((policy) => policy.sourceId === 'plos-one').maxReuseMode === 'link-only', 'PLOS baseline remains unknown/link-only');
check(policies.find((policy) => policy.sourceId === 'voa-learning-english').rightsStatus === 'partially-verified'
  && policies.find((policy) => policy.sourceId === 'voa-learning-english').maxReuseMode === 'metadata-only', 'VOA baseline remains partially-verified/metadata-only');

const plosResults = result.recordResults.filter((record) => record.sourceId === 'plos-one');
check(plosResults.every((record) => record.validationResult === 'BLOCKED'
  && record.errorCodes.includes('SOURCE_POLICY_EXCEEDED')), 'PLOS full-text requests are blocked by the source policy');
check(plosResults.every((record) => record.mappedBodyPresent === false), 'PLOS abstract body is not passed through');
check(result.recordResults.filter((record) => record.sourceId === 'voa-learning-english')
  .every((record) => record.reuseMode === 'metadata-only' && !record.errorCodes.includes('SOURCE_POLICY_EXCEEDED')), 'VOA does not exceed its metadata-only policy');
check(result.summary.approvedForLibraryImport === 0
  && result.recordResults.every((record) => !record.approvedForLibraryImport), 'no record becomes approved for Library import');
check(result.recordResults.every((record) => record.simulatedReviewStatus !== 'approved'
  && record.simulatedReviewStatus !== 'rejected'), 'blocked and unresolved records are not promoted or falsely rejected');

const duplicateManifest = structuredClone(manifest);
duplicateManifest.records[1].canonicalUrl = duplicateManifest.records[0].canonicalUrl;
const duplicateRun = generateDryRun(duplicateManifest, policies);
check(duplicateRun.recordResults.some((record) => record.errorCodes.includes('URL_DUPLICATE')), 'duplicate canonical URL is surfaced by the Phase 3.5 validator');
check(duplicateRun.summary.duplicateRecords > 0, 'duplicate summary count includes affected records');
check(duplicateRun.recordResults.find((record) => record.recordId === 'voa-8008342').validationResult === 'REVIEW_REQUIRED', 'unverified VOA canonical URL requires human source review');
check(result.summary.readyForPhase37Review === 0, 'records with unresolved schema/policy errors are not marked Phase 3.7 ready');
check(result.summary.skipped + result.summary.rejected + result.summary.pass === result.summary.recordsProcessed,
  'every pilot record receives an explicit pass/skip/reject outcome');

const markdown = renderMarkdownReport(result);
check(markdown.includes('| Processed | 8 |'), 'Markdown report includes processed total');
check(markdown.includes('Approved for Library Import | 0'), 'Markdown report explicitly reports zero Library approvals');
check(markdown.includes('SOURCE_POLICY_EXCEEDED'), 'Markdown report includes blocking error codes');
check(markdown.includes('Source ID') && markdown.includes('Missing evidence'), 'Markdown per-record table includes source IDs and missing evidence');
check(markdown.includes('Ready for Phase 3.7?'), 'Markdown per-record table reports Phase 3.7 eligibility');
check(!markdown.includes('Synthetic Example Author'), 'synthetic full-text fixture is not presented as pilot content');
check(!markdown.includes('APPROVED_FOR_LIBRARY_IMPORT'), 'report does not mark any item as approved for import');
check(resolve(getOutputPaths().json).startsWith(`${DRY_RUN_ROOT}\\`), 'JSON output path is inside Phase 3.6');
check(resolve(getOutputPaths().markdown).startsWith(`${DRY_RUN_ROOT}\\`), 'Markdown output path is inside Phase 3.6');
check(readFileSync(resolve(ROOT, 'scripts', 'dry-run.mjs'), 'utf8').includes('validateIntake'), 'dry-run adapter imports/calls the Phase 3.5 validator');

const scriptText = readFileSync(resolve(ROOT, 'scripts', 'dry-run.mjs'), 'utf8');
check(!/from\s+['"][^'"]*frontend|from\s+['"][^'"]*src\/data|fetch\s*\(|https?\.request|https?\.get|createConnection|openDatabase/i.test(scriptText), 'dry-run script has no app imports, network calls, or database code');
check(scriptText.includes('writeFileSync(OUTPUT_PATHS.json') && scriptText.includes('writeFileSync(OUTPUT_PATHS.markdown'), 'writes are limited to the two fixed Phase 3.6 report paths');
check(readFileSync(reportPath, 'utf8').includes('# Phase 3.6 Content Import Dry Run'), 'generated Markdown report exists');
const writtenResults = JSON.parse(readFileSync(resultsPath, 'utf8'));
check(writtenResults.summary.recordsProcessed === 8, 'generated machine-readable JSON report exists and contains all records');

const independentRecord = JSON.parse(readFileSync(resolve(intakeRoot, 'fixtures', 'valid', 'verified-full-text.json'), 'utf8'));
independentRecord.sourceId = 'unregistered-item-license-source';
independentRecord.recordId = 'independent-item-cleared';
independentRecord.canonicalUrl = 'https://example.invalid/independent-item-cleared';
independentRecord.externalId = 'independent-item-cleared';
independentRecord.doi = '10.5555/independent-item-cleared';
const unclearRecord = structuredClone(independentRecord);
unclearRecord.recordId = 'independent-rights-unclear';
unclearRecord.canonicalUrl = 'https://example.invalid/independent-rights-unclear';
unclearRecord.externalId = 'independent-rights-unclear';
unclearRecord.doi = '10.5555/independent-rights-unclear';
unclearRecord.rightsStatus = 'unknown';
delete unclearRecord.body;
const prohibitedRecord = structuredClone(independentRecord);
prohibitedRecord.recordId = 'independent-source-policy-blocked';
prohibitedRecord.canonicalUrl = 'https://example.invalid/independent-source-policy-blocked';
prohibitedRecord.externalId = 'independent-source-policy-blocked';
prohibitedRecord.doi = '10.5555/independent-source-policy-blocked';
prohibitedRecord.sourceId = 'plos-one';
const invalidRecord = structuredClone(independentRecord);
invalidRecord.recordId = 'independent-invalid-url';
invalidRecord.canonicalUrl = 'not-a-url';
invalidRecord.externalId = 'independent-invalid-url';
invalidRecord.doi = '10.5555/independent-invalid-url';
const independentRun = generateIntakeDryRun([independentRecord, unclearRecord, prohibitedRecord, invalidRecord], policies);
check(independentRun.summary.recordsProcessed === 4, 'independent dry run processes each supplied article');
check(independentRun.summary.passed === 1 && independentRun.summary.skipped === 1 && independentRun.summary.rejected === 2,
  'independent dry run classifies pass, unclear rights, and policy-prohibited items separately');
check(independentRun.recordResults.map((item) => item.status).join(',') === 'PASS,SKIPPED,REJECTED,REJECTED',
  'rights gaps skip; prohibited and malformed items reject while later records are still evaluated');
check(!JSON.stringify(independentRun).includes(independentRecord.body),
  'independent dry-run results never include article body text');
check(independentRun.summary.approvedForLibraryImport === 0,
  'independent dry run never creates import approval');

console.log(`${checks.passed} dry-run assertions passed.`);
