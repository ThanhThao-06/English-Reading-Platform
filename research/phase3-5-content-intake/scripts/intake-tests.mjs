import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateIntake } from './validate-intake.mjs';
import {
  detectThirdPartyAttribution,
  detectVoaProducerCredit,
  evaluateConditionalFullTextGrant,
} from './conditional-full-text-grant.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const loadDirectory = (name) => readdirSync(resolve(ROOT, 'fixtures', name))
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => readJson(resolve(ROOT, 'fixtures', name, file)));
const policies = loadDirectory('source-policies');
const validFixtures = loadDirectory('valid');
const checks = { assertions: 0, scenarios: 0 };

const verify = (condition, message) => {
  checks.assertions += 1;
  assert.ok(condition, message);
};
const expectCode = (result, code) => verify(result.errors.some((error) => error.code === code), `expected error code ${code}; got ${result.errors.map((error) => error.code).join(', ')}`);
const clone = (value) => structuredClone(value);
const fullText = validFixtures.find((record) => record.reuseMode === 'verified-full-text');
const metadata = validFixtures.find((record) => record.reuseMode === 'metadata-only');
const validate = (records, policySet = policies) => validateIntake(records, policySet);
const scenario = (name, callback) => {
  callback();
  checks.scenarios += 1;
  console.log(`PASS ${name}`);
};

scenario('valid metadata-only record', () => {
  const result = validate([metadata]);
  verify(result.valid, 'metadata fixture should validate');
  verify(result.errors.length === 0, 'metadata fixture should have no errors');
});

scenario('valid verified-full-text with item evidence and required attribution', () => {
  const result = validate([fullText]);
  verify(result.valid, 'synthetic full-text fixture should validate');
});

scenario('item-level rights can authorize a source with no registry policy', () => {
  const record = clone(fullText);
  record.recordId = 'unregistered-source-with-item-license';
  record.sourceId = 'unregistered-source';
  const result = validate([record]);
  verify(result.valid, `item-level license should be evaluated without a source policy; got ${result.errors.map((e) => e.code).join(', ')}`);
  verify(result.recordResults[0].status === 'PASS', 'cleared item receives a PASS processing status');
});

scenario('public-domain and permission evidence do not require a license document', () => {
  for (const rightsBasis of ['public-domain', 'permission']) {
    const record = clone(fullText);
    record.recordId = `unregistered-${rightsBasis}-rights`;
    record.sourceId = `unregistered-${rightsBasis}-source`;
    record.canonicalUrl = `https://example.invalid/items/${rightsBasis}-rights`;
    record.doi = `10.5555/${rightsBasis}-rights`;
    record.rightsBasis = rightsBasis;
    delete record.itemLicenseUrl;
    delete record.licenseType;
    delete record.licenseIdentifier;
    const result = validate([record], []);
    verify(result.valid, `${rightsBasis} with item-scoped rights evidence should validate`);
    verify(result.recordResults[0].status === 'PASS', `${rightsBasis} can pass without a license document`);
  }
});

scenario('invalid policy configuration fails closed without promoting records', () => {
  const result = validate([clone(fullText)], [{ sourceId: 'malformed-policy' }]);
  verify(!result.valid, 'malformed policy configuration fails validation');
  verify(result.recordResults[0].status === 'SKIPPED', 'invalid configuration cannot promote an item');
  verify(result.recordResults[0].errorCodes.includes('SOURCE_POLICY_INVALID'), 'configuration error remains auditable');
});

scenario('unclear item rights are skipped while explicit restrictions are rejected', () => {
  const unclear = clone(fullText);
  unclear.recordId = 'unregistered-source-rights-unclear';
  unclear.sourceId = 'unregistered-source';
  unclear.rightsStatus = 'unknown';
  unclear.reuseMode = 'verified-full-text';
  delete unclear.body;
  const restricted = clone(fullText);
  restricted.recordId = 'restricted-source-item';
  restricted.sourceId = 'plos-one';
  restricted.reuseMode = 'link-only';
  delete restricted.body;
  const unclearWithBody = clone(unclear);
  unclearWithBody.recordId = 'unregistered-source-rights-unclear-with-body';
  unclearWithBody.canonicalUrl = 'https://example.invalid/items/unclear-rights-with-body';
  unclearWithBody.doi = '10.5555/unclear-rights-with-body';
  unclearWithBody.body = 'Must not reach a package or production storage.';
  const itemDenied = clone(metadata);
  itemDenied.recordId = 'explicitly-prohibited-item';
  itemDenied.rightsStatus = 'not-allowed';
  const result = validate([unclear, restricted, unclearWithBody, itemDenied]);
  verify(result.recordResults[0].status === 'SKIPPED', 'unclear rights are skipped');
  verify(result.recordResults[1].status === 'REJECTED', 'a source restriction is rejected');
  verify(result.recordResults[2].status === 'SKIPPED', 'body supplied with unclear rights is skipped, never approved');
  verify(result.recordResults[3].status === 'REJECTED', 'item-level explicit prohibition is rejected');
  verify(result.recordResults.length === 4, 'a failure for one article does not stop later batch results');
});

// --- VOA Learning English conditional producer grant (Phase 3.5 -> 4.0) ---
// The official VOA Learning English reuse policy places VOA-produced Learning
// English material in the public domain with required credit, and excludes
// AP/Reuters/AFP agency material. The rule below encodes exactly that:
//   official policy + VOA-produced byline + no third-party credit => sufficient.

const voaPolicy = policies.find((policy) => policy.sourceId === 'voa-learning-english');
const VOA_POLICY_EXCERPT = 'Learning English texts, MP3s, photos and videos are in the public domain. You are allowed to reprint them for educational and commercial purposes, with credit to learningenglish.voanews.com. However, stories, photos and video images from news agencies such as AP, Reuters and AFP are copyrighted, so you are not allowed to republish them.';

/**
 * Build a VOA Learning English intake record. No itemLicenseUrl is ever set:
 * the whole point of the fix is that a VOA-produced article has no separate
 * per-article license document.
 */
const makeVoaRecord = (overrides = {}) => ({
  recordId: 'voa-learning-english-test-1',
  sourceId: 'voa-learning-english',
  title: 'Lesson 1: Welcome!',
  canonicalUrl: 'https://learningenglish.voanews.com/a/lets-learn-english-lesson-one/3111026.html',
  externalId: '3111026',
  authors: ['VOA Learning English'],
  publishedAt: '2019-09-10',
  receivedAt: '2026-10-03',
  contentType: 'educational',
  classification: { contentGroup: 'articles', primaryCategory: 'language-learning' },
  rightsStatus: 'verified',
  reuseMode: 'verified-full-text',
  rightsEvidenceUrl: 'https://learningenglish.voanews.com/p/6861.html',
  rightsEvidenceExcerpt: VOA_POLICY_EXCERPT,
  attributionRequired: true,
  attributionText: 'Credit to learningenglish.voanews.com',
  body: 'Welcome to Let\'s Learn English. In this lesson we learn how to greet people and say our names.',
  mediaAssets: [],
  reviewStatus: 'needs-quality-review',
  reviewNotes: ['VOA-produced Learning English lesson; no third-party attribution observed.'],
  ...overrides,
});

const grantFor = (record) => evaluateConditionalFullTextGrant({
  policy: voaPolicy,
  sourceId: record.sourceId,
  canonicalUrl: record.canonicalUrl,
  title: record.title,
  authors: record.authors,
  attributionRequired: record.attributionRequired,
  attributionText: record.attributionText,
  rightsEvidenceUrl: record.rightsEvidenceUrl,
  rightsEvidenceExcerpt: record.rightsEvidenceExcerpt,
  reuseMode: record.reuseMode,
  reviewStatus: record.reviewStatus,
});

// Case A: a VOA original article passes without item-level license evidence.
scenario('Case A: VOA original article passes the rights gate without item-level license evidence', () => {
  const record = makeVoaRecord();
  verify(!Object.hasOwn(record, 'itemLicenseUrl'), 'VOA fixture deliberately has no separate item-level license document');
  const result = validate([record]);
  verify(result.valid, `VOA original article should validate; got ${result.errors.map((e) => e.code).join(', ')}`);
  verify(result.errors.length === 0, 'VOA original article has no blocking errors');
  const codes = result.errors.map((error) => error.code);
  verify(!codes.includes('ITEM_RIGHTS_EVIDENCE_REQUIRED'), 'no item-level rights evidence is demanded for VOA-produced content');
  verify(!codes.includes('FULL_TEXT_LICENSE_REQUIRED'), 'no per-item license URL is demanded for VOA-produced content');
  verify(!codes.includes('SOURCE_POLICY_EXCEEDED'), 'the conditional grant lifts the metadata-only ceiling for this record only');
  verify(record.attributionText === voaPolicy.conditionalFullText.requiredAttributionText, 'the official credit line is still required');
  verify(record.rightsEvidenceUrl === voaPolicy.conditionalFullText.policyEvidenceUrl, 'official policy evidence URL is still required');
  verify(grantFor(record).granted, 'the grant is recorded as granted for the VOA original article');
});

scenario('duplicate normalized canonical URL', () => {
  const duplicate = clone(metadata);
  duplicate.recordId = 'synthetic-meta-duplicate';
  duplicate.canonicalUrl = 'HTTPS://EXAMPLE.INVALID:443/items/metadata-001#different-fragment';
  const result = validate([metadata, duplicate]);
  expectCode(result, 'URL_DUPLICATE');
  verify(result.recordResults[0].status === 'PASS' && result.recordResults[1].status === 'REJECTED',
    'the first record may proceed and the duplicate candidate is rejected');
});

scenario('duplicate DOI after DOI URL normalization', () => {
  const second = clone(fullText);
  second.recordId = 'synthetic-fulltext-doi-duplicate';
  second.doi = 'https://doi.org/10.5555/SYNTHETIC.001';
  const result = validate([fullText, second]);
  expectCode(result, 'IDENTIFIER_DUPLICATE');
});

scenario('duplicate external ID within the same source', () => {
  const second = clone(metadata);
  second.recordId = 'synthetic-meta-external-duplicate';
  const result = validate([metadata, second]);
  expectCode(result, 'IDENTIFIER_DUPLICATE');
});

scenario('invalid canonical URL', () => {
  const record = clone(metadata);
  record.canonicalUrl = 'javascript:alert(1)';
  const result = validate([record]);
  expectCode(result, 'URL_INVALID');
  verify(result.recordResults[0].status === 'REJECTED', 'invalid canonical URL is an invalid record');
});

scenario('required metadata missing', () => {
  const record = clone(metadata);
  delete record.title;
  const result = validate([record]);
  expectCode(result, 'SCHEMA_REQUIRED_FIELD');
  verify(result.recordResults[0].status === 'SKIPPED', 'missing title is deferred rather than rejected');
});

scenario('invalid calendar date and unreasonable future dates', () => {
  const invalid = clone(metadata);
  invalid.publishedAt = '2024-02-30';
  expectCode(validate([invalid]), 'DATE_INVALID');
  const futurePublished = clone(metadata);
  futurePublished.publishedAt = '2027-01-01';
  expectCode(validate([futurePublished]), 'DATE_UNREASONABLE');
  const futureReceived = clone(metadata);
  futureReceived.receivedAt = `${new Date().getUTCFullYear() + 1}-01-01`;
  expectCode(validate([futureReceived]), 'DATE_UNREASONABLE');
});

scenario('unknown rights cannot retain body', () => {
  const record = clone(metadata);
  record.rightsStatus = 'unknown';
  record.reuseMode = 'unknown';
  record.body = 'forbidden';
  expectCode(validate([record]), 'BODY_NOT_ALLOWED');
});

scenario('metadata-only cannot retain body', () => {
  const record = clone(metadata);
  record.body = 'forbidden';
  expectCode(validate([record]), 'BODY_NOT_ALLOWED');
});

scenario('link-only cannot retain body', () => {
  const record = clone(metadata);
  record.reuseMode = 'link-only';
  record.body = 'forbidden';
  expectCode(validate([record]), 'BODY_NOT_ALLOWED');
});

scenario('full-text requires item-level rights evidence', () => {
  const record = clone(fullText);
  delete record.rightsEvidenceUrl;
  delete record.rightsEvidenceExcerpt;
  expectCode(validate([record]), 'ITEM_RIGHTS_EVIDENCE_REQUIRED');
});

scenario('full-text without a recorded rights basis is skipped', () => {
  const record = clone(fullText);
  delete record.rightsBasis;
  const result = validate([record]);
  expectCode(result, 'RIGHTS_BASIS_REQUIRED');
  verify(result.recordResults[0].status === 'SKIPPED', 'an unclassified rights claim cannot be approved');
});

scenario('full-text requires attribution when declared by license evidence', () => {
  const record = clone(fullText);
  delete record.attributionText;
  expectCode(validate([record]), 'ATTRIBUTION_REQUIRED');
});

scenario('item evidence cannot broaden PLOS or VOA source policy', () => {
  for (const sourceId of ['plos-one', 'voa-learning-english']) {
    const record = clone(fullText);
    record.recordId = `synthetic-over-policy-${sourceId}`;
    record.sourceId = sourceId;
    expectCode(validate([record]), 'SOURCE_POLICY_EXCEEDED');
  }
});

scenario('unverified media warns and can be omitted without blocking otherwise eligible text', () => {
  const record = clone(fullText);
  record.mediaAssets[0].rightsStatus = 'unknown';
  const result = validate([record]);
  verify(result.valid, 'unclear media rights do not block the text');
  verify(result.warnings.some((warning) => warning.code === 'ASSET_OMITTED_UNVERIFIED'), 'unclear media rights are reported as an omission warning');
  verify(result.recordResults[0].status === 'PASS', 'eligible text remains eligible');
  const excluded = clone(fullText);
  excluded.mediaAssets[0].disposition = 'exclude';
  excluded.mediaAssets[0].rightsStatus = 'unknown';
  verify(validate([excluded]).valid, 'unverified asset explicitly excluded should not block its parent text');
  const malformed = clone(fullText);
  malformed.mediaAssets = 'unverified media payload';
  const malformedResult = validate([malformed]);
  verify(malformedResult.valid, 'malformed media metadata does not block eligible text');
  verify(malformedResult.recordResults[0].warningCodes.includes('ASSET_OMITTED_INVALID'), 'malformed media is reported as omitted');
});

scenario('valid fixtures are not falsely rejected', () => {
  const result = validate(validFixtures);
  verify(result.valid, 'all valid fixtures should validate together');
  verify(result.summary.recordsChecked === 2, 'both valid fixture records should be checked');
});

scenario('stable structured error contract and codes', () => {
  const result = validate([{ ...clone(metadata), canonicalUrl: 'invalid' }]);
  const error = result.errors.find((entry) => entry.code === 'URL_INVALID');
  verify(!result.valid, 'invalid URL makes batch invalid');
  verify(typeof error.code === 'string', 'error has a stable string code');
  verify(typeof error.message === 'string' && error.message.length > 0, 'error has a readable message');
  verify(typeof error.field === 'string', 'error has a field');
  verify(error.severity === 'error', 'error has severity');
  verify(error.recordId === metadata.recordId, 'error identifies the record');
  verify(Array.isArray(result.warnings), 'validation output exposes warnings array');
  verify(result.summary.errorCount === result.errors.length, 'summary error count matches the output');
});

// Case B/C/D: VOA-hosted articles carrying third-party credit stay blocked.
for (const [tag, label, authors] of [
  ['B', 'Case B: VOA article with AFP', ['Andrew Smith', 'Malick Rokhy Ba (Agence France-Presse)', 'Anna Matteo (adapted for VOA Learning English)']],
  ['C', 'Case C: VOA article with Reuters', ['VOA Learning English', 'Reporting by Reuters']],
  ['D', 'Case D: VOA article with AP', ['VOA Learning English', 'The Associated Press']],
]) {
  scenario(`${label} is blocked and must be rejected`, () => {
    const record = makeVoaRecord({
      recordId: `voa-third-party-${tag}`,
      title: 'Senegal Starts Introducing English in Preschools',
      authors,
      reviewStatus: 'needs-rights-review',
    });
    const result = validate([record]);
    verify(!result.valid, `${label} must not validate`);
    expectCode(result, 'THIRD_PARTY_CONTENT_BLOCKED');
    const codes = result.errors.map((error) => error.code);
    verify(!codes.includes('CONDITIONAL_RIGHTS_NOT_MET'), 'a third-party block is a hard block, not a conditions gap');
    const approved = validate([{ ...record, reviewStatus: 'approved' }]);
    expectCode(approved, 'APPROVAL_BLOCKED');
    verify(result.errors.some((error) => error.message.includes('must be rejected')), 'the block states the record must be rejected');
    const grant = grantFor(record);
    verify(grant.thirdPartyBlocked && !grant.granted, 'the VOA domain cannot override third-party copyright');
  });
}

scenario('conditional grant requires an official host, a VOA byline, and policy evidence', () => {
  expectCode(validate([makeVoaRecord({ recordId: 'voa-off-host', canonicalUrl: 'https://mirror.example.invalid/a/3111026.html' })]), 'CONDITIONAL_RIGHTS_NOT_MET');
  expectCode(validate([makeVoaRecord({ recordId: 'voa-no-byline', authors: ['A. Contributor'] })]), 'CONDITIONAL_RIGHTS_NOT_MET');
  expectCode(validate([makeVoaRecord({ recordId: 'voa-no-policy-evidence', rightsEvidenceUrl: 'https://example.invalid/not-the-policy' })]), 'CONDITIONAL_RIGHTS_NOT_MET');
  expectCode(validate([makeVoaRecord({ recordId: 'voa-no-excerpt', rightsEvidenceExcerpt: '' })]), 'CONDITIONAL_RIGHTS_NOT_MET');
  expectCode(validate([makeVoaRecord({ recordId: 'voa-no-attribution', attributionText: '' })]), 'CONDITIONAL_RIGHTS_NOT_MET');
});

scenario('conditional grant never relaxes a restricted source policy or other safety rules', () => {
  expectCode(validate([makeVoaRecord({ recordId: 'voa-restricted-source' })], [{ ...voaPolicy, rightsStatus: 'restricted' }]), 'SOURCE_POLICY_RESTRICTED');

  const noBody = makeVoaRecord({ recordId: 'voa-no-body' });
  delete noBody.body;
  expectCode(validate([noBody]), 'FULL_TEXT_BODY_REQUIRED');

  expectCode(validate([makeVoaRecord({ recordId: 'voa-unverified', rightsStatus: 'partially-verified' })]), 'RIGHTS_STATUS_INSUFFICIENT');
  expectCode(validate([makeVoaRecord({ recordId: 'voa-metadata-with-body', reuseMode: 'metadata-only', rightsStatus: 'partially-verified' })]), 'BODY_NOT_ALLOWED');
});

scenario('malformed or synthetic conditional grants are rejected as invalid policy', () => {
  const malformed = { ...voaPolicy, conditionalFullText: { grantId: '', policyEvidenceUrl: 'not-a-url', allowedHosts: [], requiredAttributionText: '' } };
  expectCode(validate([makeVoaRecord({ recordId: 'voa-malformed-policy' })], [malformed]), 'SOURCE_POLICY_INVALID');
  expectCode(validate([makeVoaRecord({ recordId: 'voa-synthetic-policy' })], [{ ...voaPolicy, synthetic: true }]), 'SOURCE_POLICY_INVALID');
});

scenario('third-party detection distinguishes agency credit from VOA course names', () => {
  verify(detectThirdPartyAttribution({ authors: ['VOA Learning English'] }).length === 0, 'a VOA byline is not third-party');
  verify(detectThirdPartyAttribution({ title: 'AP English: Lesson 1' }).length === 0, 'the AP English course series is not a third-party credit');
  verify(detectThirdPartyAttribution({ authors: ['Voice of America'] }).length === 0, 'a VOA byline in long form is not third-party');
  verify(detectThirdPartyAttribution({ authors: ['Reporting by AFP'] }).some((f) => f.sourceId === 'afp'), 'AFP bylines are detected');
  verify(detectThirdPartyAttribution({ authors: ['Reuters'] }).some((f) => f.sourceId === 'reuters'), 'Reuters bylines are detected');
  verify(detectThirdPartyAttribution({ authors: ['Associated Press'] }).some((f) => f.sourceId === 'associated-press'), 'AP bylines are detected');
  verify(detectThirdPartyAttribution({ attributionText: 'Courtesy of Getty Images' }).some((f) => f.sourceId === 'getty-images'), 'third-party image credits are detected');
  verify(detectThirdPartyAttribution({}).length === 0, 'empty input yields no findings');
  verify(detectVoaProducerCredit({ authors: ['VOA Learning English'] }), 'VOA producer credit is recognized');
  verify(!detectVoaProducerCredit({ authors: ['A. Contributor'] }), 'an unrelated byline is not VOA production evidence');
  verify(!detectVoaProducerCredit({ authors: [] }), 'an absent byline is not VOA production evidence');
});

scenario('Case E: non-VOA source cannot benefit from the VOA rights rule', () => {
  const record = makeVoaRecord({
    recordId: 'non-voa-full-text',
    sourceId: 'synthetic-open-source',
    canonicalUrl: 'https://example.invalid/items/voa-lookalike',
  });
  record.rightsBasis = 'license';
  delete record.itemLicenseUrl;
  const grant = grantFor({ ...record, sourceId: 'synthetic-open-source' });
  verify(!grant.appliesToSource && !grant.granted, 'the grant applies only to the source whose policy declares it');
  verify(grant.thirdParty.length === 0, 'no third-party credit is asserted by the non-VOA source');
  const result = validate([record]);
  expectCode(result, 'ITEM_RIGHTS_EVIDENCE_REQUIRED');
  const codes = result.errors.map((error) => error.code);
  verify(!codes.includes('CONDITIONAL_RIGHTS_NOT_MET'), 'the VOA grant never applies to a different source');
  verify(!codes.includes('THIRD_PARTY_CONTENT_BLOCKED'), 'the VOA third-party rule is scoped to the VOA source');

  const voaHostOtherSource = makeVoaRecord({
    recordId: 'voa-host-other-source',
    sourceId: 'synthetic-open-source',
    canonicalUrl: 'https://learningenglish.voanews.com/a/lets-learn-english-lesson-one/3111026.html',
  });
  voaHostOtherSource.rightsBasis = 'license';
  delete voaHostOtherSource.itemLicenseUrl;
  expectCode(validate([voaHostOtherSource]), 'ITEM_RIGHTS_EVIDENCE_REQUIRED');
});

console.log(`${checks.scenarios} scenarios passed; ${checks.assertions} assertions passed.`);