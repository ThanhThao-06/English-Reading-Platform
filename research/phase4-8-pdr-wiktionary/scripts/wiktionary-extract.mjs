/**
 * Wiktionary entry extraction and third-party exclusion rules.
 *
 * Wiktionary's own copyright page states that entry text is dual-licensed under
 * CC BY-SA 4.0 and the GFDL, and warns that entries "may include text, images,
 * sounds, or other material from external sources with different copyright
 * terms, and which is used with permission or under the 'fair use' doctrine",
 * with those other rights holders retaining their rights.
 *
 * The licence of an entry is therefore NOT uniform. This module enforces the
 * task's rule directly: CC BY-SA evidence is required per item, and third-party
 * or non-compatible content is EXCLUDED from the body rather than assumed
 * compatible.
 */
import { decodeEntities } from './lib.mjs';

/**
 * Non-compatible content that must never reach the extracted body.
 *
 * Fair-use quotations and externally sourced blocks keep their own rights, so
 * they are removed whole rather than copied, and their presence is reported so
 * the item can be judged on what would actually be reused.
 */
const THIRD_PARTY_BLOCKS = [
  // Fair-use quotation blocks and citation-bearing quote templates.
  /\{\{\s*(?:rq|quotation|quote|quote-book|quote-journal|quote-text|quote-video|quote-song|quote-lyrics|quote-website)\b[\s\S]*?\}\}/gi,
  // Non-free content criteria and fair-use rationales.
  /\{\{\s*(?:fair use|non-free|nf|copyright violation|copyvio|license|licence|attribution|permission)\b[\s\S]*?\}\}/gi,
  // External-source markers PDR-style credits use; kept out of the body too.
  /\{\{\s*(?:orphan|interwiki|wikispecies|wikiquote|sister)\b[\s\S]*?\}\}/gi,
];

/** Remove whole third-party blocks. */
export const stripBlocks = (text) => THIRD_PARTY_BLOCKS.reduce((acc, re) => acc.replace(re, ' '), text);

/** Remove comments, references, file links and simple inline templates. */
export const stripResidual = (text) => text
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<ref[^>]*\/>/gi, ' ')
  .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\[\[(?:File|Image|Category|Media)\s*:[^\]]*\]\]/gi, ' ')
  .replace(/\[(?:https?:)\/\/\S+\s+([^\]]*)\]/g, '$1')
  .replace(/\[(?:https?:)\/\/\S+\]/g, ' ')
  .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  .replace(/\[\[([^\]]+)\]\]/g, '$1');

/**
 * Reduce a template to its human-readable argument.
 *
 * Templates must not simply be deleted: an etymology sentence such as
 * "From Latin {{lang|la|salārium}} ..." loses the word it is actually about if
 * the template is dropped. Language and term templates therefore collapse to
 * their displayed text, while purely structural templates are removed.
 *
 * The last positional argument is the displayed word in the ancestry, gloss and
 * language templates Wiktionary uses in etymologies ({{inh}}, {{der}}, {{lang}},
 * {{m}}, {{term}}, ...), with a trailing gloss ("||wages") discarded.
 */
const TEMPLATE_ARG = /\{\{([^{}|]+)(?:\|([^{}]*))?\}\}/g;

/** ISO 639-3/639-1 codes Wiktionary uses in the first positional argument. */
const LANG_CODE = /^[a-z]{2,3}(?:-[a-z]{2,4})?(?:-new|-lat|-roman|-old)?$/i;

/** Historical language codes worth expanding so the prose reads as English. */
const LANGUAGE_NAMES = new Map([
  ['ang', 'Old English'], ['enm', 'Middle English'], ['en', 'English'],
  ['xno', 'Anglo-Norman'], ['fro', 'Old French'], ['frm', 'Middle French'],
  ['la', 'Latin'], ['la-new', 'Neo-Latin'], ['la-lat', 'Late Latin'],
  ['la-vul', 'Vulgar Latin'], ['grc', 'Ancient Greek'], ['grc-pro', 'Provençal'],
  ['it', 'Italian'], ['fr', 'French'], ['de', 'German'], ['nl', 'Dutch'],
  ['es', 'Spanish'], ['pt', 'Portuguese'], ['ar', 'Arabic'], ['tr', 'Turkish'],
  ['pl', 'Polish'], ['ru', 'Russian'], ['sv', 'Swedish'], ['da', 'Danish'],
]);

export const inlineTemplates = (text) => text.replace(TEMPLATE_ARG, (match, name, args) => {
  const template = name.trim().toLowerCase();
  const parts = String(args ?? '').split('|').map((part) => part.trim());

  // Structural or metadata templates contribute no prose.
  if (/^(?:see also|reflist|references|quote|quotation|rq|attribution|label|wikidata|topics|cln|en-topics|topicsl|usex|syn|n-syn|ant|trans-top|trans-bottom|cont)\b/.test(template)) {
    return ' ';
  }

  // Ancestry and language templates: keep the displayed final term.
  if (/^(?:inh|der|desc|descendant|affix|bor|ubor|slink|l|term|gloss|lang|m|mention|link|ux|transliteration|taxlink|vern)\b/.test(template)) {
    // Positional arguments only, minus the language code that leads them.
    const positional = parts.filter((part) => part && !part.includes('='));
    const withoutCode = positional.filter((part) => !LANG_CODE.test(part));
    const candidates = withoutCode.length ? withoutCode : positional;

    // A "||gloss" continuation carries a translation, so the headword is the
    // argument BEFORE it.
    let shown = candidates.length > 1 ? candidates.at(-2) : candidates.at(-1);

    // If only a language code survived, name the language instead of leaving
    // a bare code such as "enm" in the sentence.
    if (shown && LANG_CODE.test(shown)) {
      shown = LANGUAGE_NAMES.get(shown.toLowerCase()) ?? null;
    }
    return shown ? ` ${shown} ` : ' ';
  }

  return match;
});

/** Collapse any remaining template, including ones spanning several lines. */
export const dropNestedTemplates = (text) => {
  let out = text;
  // Repeat until stable: nested templates need more than one pass.
  for (let pass = 0; pass < 4; pass += 1) {
    const next = out.replace(/\{\{(?:[^{}]|\{[^{}]*\})*\}\}/g, ' ');
    if (next === out) break;
    out = next;
  }
  return out;
};

/**
 * Reject prose that is really template residue.
 *
 * A `{{passage=...}}` argument that survives the reductions is a quotation
 * placeholder, not reusable text: it would import as literal "passage=..." with
 * no rights behind it, so such lines are dropped rather than stored.
 */
const isResidue = (prose) => /passage\s*=|^\s*[a-z-]{2,12}\s*=\s*|\}\}|\{\{|\|\||\btext\s*=\s*\[/.test(prose);

/** Convert one wikitext line into readable prose, or '' if nothing remains. */
export const toProse = (line) => {
  // Definition-list lines carry real content: "#" and "#:" are a word's senses
  // and sub-senses, which are part of the entry. "#*" is a usage example and
  // "#:" under a sense is often citation residue, so examples are excluded while
  // senses are kept; `isResidue` then drops the citation fields themselves.
  if (/^\s*[#*][*:]/.test(line)) return '';

  const prose = decodeEntities(dropNestedTemplates(inlineTemplates(stripResidual(stripBlocks(line)))))
    .replace(/'''+|''+/g, '')
    .replace(/\{\{[^{}]*\}\}/g, ' ')
    .replace(/[#*;:]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // A line that is now only punctuation or fragments is not usable prose.
  if (!prose || !/[a-z]{3}/i.test(prose)) return '';
  // Template residue is not text and carries no rights evidence.
  if (isResidue(prose)) return '';
  return prose;
};

/** POS headings whose gloss lines are part of the article body. */
const POS = /^(noun|verb|adjective|adverb|pronoun|preposition|conjunction|interjection|determiner|numeral|article|prefix|suffix|infix)\b/i;

/**
 * Build the reusable body for one entry: the Etymology section plus the POS
 * definitions, with every third-party block removed.
 *
 * Returns the body text and a per-item report of what was excluded, so the
 * exclusion is auditable rather than implied.
 */
export const extractEntry = (sections) => {
  const englishIndex = sections.findIndex((s) => s.depth === 2 && /^english$/i.test(s.heading.trim()));
  if (englishIndex < 0) {
    return { ok: false, reason: 'NO_ENGLISH_SECTION' };
  }

  // Children of the English block run until the next language heading.
  const children = [];
  for (let i = englishIndex + 1; i < sections.length && sections[i].depth > 2; i += 1) {
    children.push(sections[i]);
  }

  const top = children.filter((s) => s.depth === 3);
  const rawEnglish = sections[englishIndex].lines.join('\n');

  // What third-party material exists at all, whether or not it is copied.
  const indicators = {
    quoteTemplates: (rawEnglish.match(/\{\{\s*(?:rq|quotation|quote)\b/gi) || []).length,
    fairUseTemplates: (rawEnglish.match(/\{\{\s*(?:fair use|non-free|nf)\b/gi) || []).length,
    fileOrMediaLinks: (rawEnglish.match(/\[\[(?:File|Image|Media)\s*:/gi) || []).length,
    copyrightNotices: (rawEnglish.match(/\u00a9|\bcopyright\b|all rights reserved/gi) || []).length,
    // Templated external-source notices that are not fair use per se.
    externalSourceTemplates: (rawEnglish.match(/\{\{\s*(?:attribution|license|licence|permission|orphan)\b/gi) || []).length,
  };

  // Entries use numbered etymologies ("Etymology 1", "Etymology 2") when a
  // word has several distinct origins; all of them are relevant.
  const keep = top.filter((s) => /^etymology\b/i.test(s.heading.trim()) || POS.test(s.heading.trim()));
  if (!keep.length) {
    return { ok: false, reason: 'NO_ETYMOLOGY_OR_DEFINITION', indicators, subsections: top.map((s) => s.heading.trim()) };
  }

  const parts = [];
  const excluded = [];
  for (const section of keep) {
    const heading = section.heading.trim();
    const kept = [];
    for (const line of section.lines) {
      // Record what is dropped so the exclusion is visible in the audit.
      if (/\{\{\s*(?:rq|quotation|quote|fair use|non-free|nf)\b/i.test(line)) {
        excluded.push({ heading, kind: 'third-party-block', text: line.trim().slice(0, 160) });
        continue;
      }
      if (/\[\[(?:File|Image|Media)\s*:/i.test(line)) {
        excluded.push({ heading, kind: 'media-link', text: line.trim().slice(0, 160) });
        continue;
      }
      const prose = toProse(line);
      if (prose) kept.push(prose);
    }
    if (kept.length) {
      parts.push(heading);
      parts.push(...kept);
    }
  }

  const body = parts.join('\n\n');
  return {
    ok: true,
    body,
    wordCount: body.split(/\s+/).filter(Boolean).length,
    indicators,
    excluded,
    subsections: top.map((s) => s.heading.trim()),
    hasEtymology: top.some((s) => /^etymology\b/i.test(s.heading.trim())),
  };
};