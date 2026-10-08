import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePilotManifest } from './pilot-validation.mjs';

const pilotRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(pilotRoot, 'pilot-manifest.json'), 'utf8'));
const errors = validatePilotManifest(manifest, { pilotRoot });
if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Valid pilot manifest: ${manifest.records.length} records.`);
}
