import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PILOT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RIGHTS_STATUSES = new Set(['verified', 'partially-verified', 'unknown', 'restricted', 'not-allowed']);
const REUSE_MODES = new Set(['verified-full-text', 'metadata-only', 'link-only', 'unknown', 'restricted']);
const LICENSE_TYPES = new Set(['public-domain', 'creative-commons', 'permitted-reuse', 'link-only', 'unknown']);
const CONTENT_GROUPS = new Set(['articles', 'encyclopedia', 'specialized', 'short-story', 'novel', 'classic-literature']);
const CONTENT_TYPES = new Set(['news', 'editorial', 'educational', 'expository', 'short-story', 'novel', 'classic-literature', 'poetry', 'dialogue', 'other']);
const CATEGORIES = new Set(['science', 'technology', 'business', 'finance', 'healthcare', 'history', 'culture', 'environment', 'education', 'psychology', 'travel', 'sports', 'society', 'politics', 'literature', 'language-learning', 'food', 'art', 'career', 'other']);
const SOURCE_BASELINES = {
  'plos-one': { rightsStatus: 'unknown', contentReuse: 'link-only', licenseType: null, licenseUrl: null, registrySource: 'frontend/src/data/contentSources.ts' },
  'voa-learning-english': { rightsStatus: 'partially-verified', contentReuse: 'metadata-only', licenseType: 'public-domain', licenseUrl: 'https://learningenglish.voanews.com/p/6861.html' },
};

const isHttpUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const isDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}Z)?$/.test(value) && !Number.isNaN(Date.parse(value));
const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export const validateNormalizedText = (text) => {
  const errors = [];
  if (typeof text !== 'string' || !text.trim()) return ['normalized text must not be empty'];
  if (text.includes('\uFFFD')) errors.push('normalized text contains a Unicode replacement character');
  if (/skip to main content|cookie preference center|additional links|download pdf/i.test(text)) {
    errors.push('normalized text contains an obvious page navigation/footer fragment');
  }
  return errors;
};

export const validatePilotRecord = (record, { pilotRoot = PILOT_ROOT, checkContentFiles = true } = {}) => {
  const errors = [];
  const fail = (message) => errors.push(`${record?.id ?? '(no id)'}: ${message}`);

  if (!record || typeof record !== 'object' || Array.isArray(record)) return ['record must be an object'];
  if (typeof record.id !== 'string' || !record.id.trim()) fail('id is required');
  if (typeof record.sourceId !== 'string' || !record.sourceId.trim()) fail('sourceId is required');
  if (typeof record.title !== 'string' || !record.title.trim()) fail('title is required');
  if (!isHttpUrl(record.sourceUrl)) fail('sourceUrl must be a valid absolute HTTP(S) URL');
  if (record.canonicalUrl !== null && !isHttpUrl(record.canonicalUrl)) fail('canonicalUrl must be null or a valid absolute HTTP(S) URL');
  if (record.doi !== null && (typeof record.doi !== 'string' || !record.doi.trim())) fail('doi must be null or a non-empty string');
  if (record.publishedAt !== null && !isDate(record.publishedAt)) fail('publishedAt must be null or a valid ISO date/timestamp');
  if (!isDate(record.retrievedAt)) fail('retrievedAt must be a valid ISO date');
  if (!CONTENT_GROUPS.has(record.contentGroup)) fail('contentGroup is not a supported ContentGroup');
  if (record.contentType !== null && !CONTENT_TYPES.has(record.contentType)) fail('contentType is not a supported ContentType or null');
  if (!Array.isArray(record.authors)) fail('authors must be an array');

  if (record.categories !== null) {
    if (!record.categories || typeof record.categories !== 'object' || Array.isArray(record.categories)) {
      fail('categories must be null or a category object');
    } else {
      const primary = record.categories.primaryCategory;
      const secondary = record.categories.secondaryCategories;
      if (primary !== null && !CATEGORIES.has(primary)) fail('primaryCategory is invalid');
      if (!Array.isArray(secondary) || secondary.some((category) => !CATEGORIES.has(category))) fail('secondaryCategories contains an invalid category');
      if (primary && secondary?.includes(primary)) fail('primaryCategory must not be repeated in secondaryCategories');
      if (Array.isArray(secondary) && new Set(secondary).size !== secondary.length) fail('secondaryCategories must not contain duplicates');
    }
  }

  const rights = record.rights;
  if (!rights || !RIGHTS_STATUSES.has(rights.verificationStatus)) fail('rights.verificationStatus is invalid');
  if (!rights || !REUSE_MODES.has(rights.permittedReuseMode)) fail('rights.permittedReuseMode is invalid');
  if (!rights || typeof rights.reason !== 'string' || !rights.reason.trim()) fail('rights.reason is required');
  if (!rights || typeof rights.attributionRequired !== 'boolean') fail('rights.attributionRequired must be boolean');
  if (rights?.attributionRequired && (typeof rights.attributionText !== 'string' || !rights.attributionText.trim())) fail('attribution text is required when attribution is required');
  if (!rights?.sourcePolicySnapshot || !sameJson(rights.sourcePolicySnapshot, SOURCE_BASELINES[record.sourceId] && {
    rightsStatus: SOURCE_BASELINES[record.sourceId].rightsStatus,
    contentReuse: SOURCE_BASELINES[record.sourceId].contentReuse,
  })) fail('sourcePolicySnapshot differs from the unchanged Phase 3.3 baseline');

  const mode = rights?.permittedReuseMode;
  const isFullText = mode === 'verified-full-text';
  if (isFullText) {
    if (rights.verificationStatus !== 'verified') fail('full-text reuse requires verified item-level rights');
    if (!record.itemLicense || !LICENSE_TYPES.has(record.itemLicense.type)) fail('full-text reuse requires a valid item-level license');
    if (!record.itemLicense?.identifier?.trim()) fail('full-text reuse requires the exact item-level license identifier');
    if (!isHttpUrl(record.itemLicense?.licenseUrl)) fail('full-text reuse requires a valid item-level license URL');
    if (!isHttpUrl(record.itemLicense?.evidenceUrl)) fail('full-text reuse requires an item-level evidence URL');
    if (typeof record.itemLicense?.evidenceExcerpt !== 'string' || !record.itemLicense.evidenceExcerpt.trim()) fail('full-text reuse requires a captured item-level license statement');
    if (!isDate(record.itemLicense?.verifiedAt)) fail('full-text reuse requires an item-level verification date');
    if (!rights.attributionRequired || !rights.attributionText?.trim()) fail('full-text reuse requires attribution');
    if (!record.storedContent || typeof record.storedContent.path !== 'string' || !record.storedContent.path.trim()) fail('full-text pilot items require a retained normalized text artifact');
    if (rights.sourcePolicySnapshot?.rightsStatus === 'restricted' || rights.sourcePolicySnapshot?.rightsStatus === 'not-allowed') fail('item-level rights cannot override a restricted/not-allowed source');
    if (rights.sourcePolicySnapshot?.rightsStatus === 'unknown' && (!rights.itemLevelEvidenceException?.applied || !isHttpUrl(rights.itemLevelEvidenceException?.evidenceUrl))) fail('an unknown source baseline requires an explicit, evidenced item-level decision; defaults cannot approve full text');
  } else {
    if (record.storedContent !== null) fail(`${mode} records must not retain article body text`);
    if (mode === 'unknown' && rights.verificationStatus !== 'unknown') fail('unknown reuse mode requires unknown verification status');
    if (mode === 'restricted' && rights.verificationStatus !== 'restricted' && rights.verificationStatus !== 'not-allowed') fail('restricted reuse mode requires restricted/not-allowed verification status');
    if (rights?.itemLevelEvidenceException?.applied) fail('an item-level exception may only be recorded for a verified full-text item');
  }

  if (record.itemLicense !== null && (!record.itemLicense || !LICENSE_TYPES.has(record.itemLicense.type))) fail('itemLicense must be null or use a valid license type');
  if (!Array.isArray(record.excludedAssets)) fail('excludedAssets must be an array');
  for (const asset of record.excludedAssets ?? []) {
    if (asset.decision?.startsWith('excluded') !== true) fail(`asset ${asset.assetRef ?? '(unnamed)'} is not explicitly excluded`);
    if (asset.evidenceUrl !== undefined && !isHttpUrl(asset.evidenceUrl)) fail(`asset ${asset.assetRef ?? '(unnamed)'} has an invalid evidence URL`);
  }

  if (record.storedContent && checkContentFiles) {
    const normalizedPath = record.storedContent.path.replace(/[\\/]+/g, sep);
    const fullPath = resolve(pilotRoot, normalizedPath);
    if (!fullPath.startsWith(`${resolve(pilotRoot)}${sep}`)) fail('storedContent.path escapes the isolated pilot directory');
    else if (!existsSync(fullPath)) fail(`stored content file does not exist: ${record.storedContent.path}`);
    else {
      const text = readFileSync(fullPath, 'utf8');
      for (const textError of validateNormalizedText(text)) fail(`${record.storedContent.path}: ${textError}`);
    }
  }

  return errors;
};

export const validatePilotManifest = (manifest, options = {}) => {
  const errors = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return ['manifest must be an object'];
  if (manifest.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!Array.isArray(manifest.records)) return ['records must be an array'];

  for (const [sourceId, expected] of Object.entries(SOURCE_BASELINES)) {
    const actual = manifest.sourcePolicySnapshots?.[sourceId];
    if (!actual || !sameJson(actual, expected)) errors.push(`sourcePolicySnapshots.${sourceId} changed from the Phase 3.3 baseline`);
  }

  const ids = new Set();
  const urls = new Set();
  const dois = new Set();
  for (const record of manifest.records) {
    errors.push(...validatePilotRecord(record, options));
    if (record?.id && ids.has(record.id)) errors.push(`${record.id}: duplicate record id`);
    if (record?.id) ids.add(record.id);

    if (record?.canonicalUrl) {
      if (urls.has(record.canonicalUrl)) errors.push(`${record.id}: duplicate canonical URL ${record.canonicalUrl}`);
      urls.add(record.canonicalUrl);
    }
    if (record?.doi) {
      const normalizedDoi = record.doi.trim().toLowerCase();
      if (dois.has(normalizedDoi)) errors.push(`${record.id}: duplicate DOI ${record.doi}`);
      dois.add(normalizedDoi);
    }
  }

  return errors;
};
