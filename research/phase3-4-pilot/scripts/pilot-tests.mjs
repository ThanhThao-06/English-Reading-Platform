import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateNormalizedText, validatePilotManifest, validatePilotRecord } from './pilot-validation.mjs';

const pilotRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(pilotRoot, 'pilot-manifest.json'), 'utf8'));
const errors = validatePilotManifest(manifest);
assert.deepEqual(errors, [], `Manifest errors:\n${errors.join('\n')}`);
assert.deepEqual(validateNormalizedText('A normalized publisher abstract with no page chrome.'), []);
assert(validateNormalizedText('Skip to main content').some((error) => error.includes('navigation/footer')));
assert(validateNormalizedText('Bad encoding: \uFFFD').some((error) => error.includes('replacement character')));

const baseRecord = manifest.records[0];
const withoutSourceUrl = { ...baseRecord, sourceUrl: '' };
assert(validatePilotRecord(withoutSourceUrl).some((error) => error.includes('sourceUrl')));

const duplicateUrl = structuredClone(manifest);
duplicateUrl.records[1].canonicalUrl = duplicateUrl.records[0].canonicalUrl;
assert(validatePilotManifest(duplicateUrl).some((error) => error.includes('duplicate canonical URL')));

const duplicateDoi = structuredClone(manifest);
duplicateDoi.records[1].doi = duplicateDoi.records[0].doi;
assert(validatePilotManifest(duplicateDoi).some((error) => error.includes('duplicate DOI')));

const unknownRights = {
  ...baseRecord,
  id: 'fixture-unknown-rights',
  rights: {
    ...baseRecord.rights,
    verificationStatus: 'unknown',
    permittedReuseMode: 'verified-full-text',
    itemLevelEvidenceException: { applied: false, reason: 'No item evidence.' },
  },
  itemLicense: null,
  storedContent: baseRecord.storedContent,
};
assert(validatePilotRecord(unknownRights, { pilotRoot, checkContentFiles: false }).some((error) => error.includes('verified item-level rights')));
assert(validatePilotRecord(unknownRights, { pilotRoot, checkContentFiles: false }).some((error) => error.includes('item-level license')));

const metadataOnlyRecord = manifest.records.find((record) => record.rights.permittedReuseMode === 'metadata-only');
assert(metadataOnlyRecord, 'metadata-only VOA record exists');
for (const mode of ['metadata-only', 'link-only']) {
  const noBody = mode === 'metadata-only'
    ? metadataOnlyRecord
    : {
        ...metadataOnlyRecord,
        id: 'fixture-link-only',
        rights: { ...metadataOnlyRecord.rights, permittedReuseMode: 'link-only' },
      };
  const illicitBody = { ...noBody, storedContent: { path: 'content/forbidden.txt', scope: 'full-text' } };
  assert(validatePilotRecord(illicitBody, { pilotRoot, checkContentFiles: false }).some((error) => error.includes('must not retain article body text')));
}

const noItemEvidence = {
  ...baseRecord,
  itemLicense: { ...baseRecord.itemLicense, evidenceUrl: null, evidenceExcerpt: '' },
};
assert(validatePilotRecord(noItemEvidence, { pilotRoot, checkContentFiles: false }).some((error) => error.includes('item-level evidence URL')));
assert(validatePilotRecord(noItemEvidence, { pilotRoot, checkContentFiles: false }).some((error) => error.includes('license statement')));

const noAttribution = {
  ...baseRecord,
  rights: { ...baseRecord.rights, attributionText: '' },
};
assert(validatePilotRecord(noAttribution, { pilotRoot, checkContentFiles: false }).some((error) => error.includes('attribution')));

const hardRestrictedSource = {
  ...baseRecord,
  rights: {
    ...baseRecord.rights,
    sourcePolicySnapshot: { rightsStatus: 'restricted', contentReuse: 'link-only' },
    itemLevelEvidenceException: { applied: true, evidenceUrl: baseRecord.sourceUrl },
  },
};
assert(validatePilotRecord(hardRestrictedSource, { pilotRoot, checkContentFiles: false }).some((error) => error.includes('cannot override a restricted/not-allowed source')));

const leakedMedia = {
  ...baseRecord,
  excludedAssets: [{ assetRef: 'map', decision: 'retained', evidenceUrl: baseRecord.sourceUrl }],
};
assert(validatePilotRecord(leakedMedia, { pilotRoot, checkContentFiles: false }).some((error) => error.includes('not explicitly excluded')));
assert(manifest.records.some((record) => record.excludedAssets.some((asset) => asset.assetRef === 'Fig 1 map' && asset.decision === 'excluded-unresolved-third-party-rights')));
assert(manifest.records.filter((record) => record.sourceId === 'plos-one').every((record) => record.storedContent?.scope === 'abstract-only'));
assert(manifest.records.filter((record) => record.sourceId === 'voa-learning-english').every((record) => record.storedContent === null));
assert.deepEqual(manifest.sourcePolicySnapshots['plos-one'], { rightsStatus: 'unknown', contentReuse: 'link-only', licenseType: null, licenseUrl: null, registrySource: 'frontend/src/data/contentSources.ts' });
assert.deepEqual(manifest.sourcePolicySnapshots['voa-learning-english'], { rightsStatus: 'partially-verified', contentReuse: 'metadata-only', licenseType: 'public-domain', licenseUrl: 'https://learningenglish.voanews.com/p/6861.html' });

console.log(`Pilot manifest valid: ${manifest.records.length} records; fixture checks passed.`);
