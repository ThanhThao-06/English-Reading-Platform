import {
  DictionaryLookupError,
  type DictionaryEntry,
} from '../types/dictionary';

/* ==========================================================================
   Sources
   --------------------------------------------------------------------------
   1. English definitions / IPA / audio / examples  -> Wiktionary (en)
   2. Vietnamese meaning                            -> Wiktionary (vi), MyMemory
   3. Vietnamese translation of the example         -> MyMemory

   All endpoints are public, need no API key and send
   `Access-Control-Allow-Origin: *`, so they work straight from the browser.
   ========================================================================== */

const EN_WIKTIONARY_API = 'https://en.wiktionary.org/w/api.php';
const VI_WIKTIONARY_API = 'https://vi.wiktionary.org/w/api.php';
const MYMEMORY_API = 'https://api.mymemory.translated.net/get';
const COMMONS_FILE_PATH = 'https://commons.wikimedia.org/wiki/Special:FilePath/';

const REQUEST_TIMEOUT_MS = 12000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 400;
const CACHE_TTL_MS = 1000 * 60 * 30;

/**
 * Repeat lookups are common while reading (the same word often appears more
 * than once), so entries are cached to keep the number of API calls low.
 */
const cache = new Map<string, { value: string | null; expiresAt: number }>();

/** Wikimedia replies to throttled clients with HTTP 200 plus a plain-text body. */
const isRateLimited = (body: string): boolean =>
  /too many requests|rate limit|best practices/i.test(body);

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/* ==========================================================================
   Low level helpers
   ========================================================================== */

const fetchJson = async <T>(url: string, attempt = 0): Promise<T | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) return null;

    const text = await response.text();
    const head = text.trimStart();

    if (!head.startsWith('{') && !head.startsWith('[')) {
      // Back off and retry once the shared API budget recovers.
      if (isRateLimited(text) && attempt < MAX_RETRIES) {
        await delay(RETRY_BASE_DELAY_MS * (attempt + 1));
        return fetchJson<T>(url, attempt + 1);
      }
      return null;
    }

    return JSON.parse(text) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/** Fetch the raw wikitext of a Wiktionary entry, or null when it does not exist. */
const fetchWikitext = async (lang: 'en' | 'vi', title: string): Promise<string | null> => {
  const cacheKey = `${lang}:${title}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const api = lang === 'en' ? EN_WIKTIONARY_API : VI_WIKTIONARY_API;
  const params = new URLSearchParams({
    action: 'query',
    prop: 'revisions',
    rvprop: 'content',
    rvslots: 'main',
    format: 'json',
    formatversion: '2',
    redirects: '1',
    titles: title,
    origin: '*',
  });

  type WikiResponse = {
    query?: {
      pages?: Array<{
        missing?: boolean;
        revisions?: Array<{ slots?: { main?: { content?: string } } }>;
      }>;
    };
  };

  const data = await fetchJson<WikiResponse>(`${api}?${params.toString()}`);
  const page = data?.query?.pages?.[0];
  const raw = page && !page.missing ? page.revisions?.[0]?.slots?.main?.content : undefined;
  const content = raw && raw.trim() ? raw : null;

  cache.set(cacheKey, { value: content, expiresAt: Date.now() + CACHE_TTL_MS });
  return content;
};

/**
 * A null result means "no entry" only when the request actually succeeded.
 * Returns true when the page genuinely does not exist, false when the request
 * failed (offline, throttled) and the answer is therefore unknown.
 */
const pageIsConfirmedMissing = async (title: string): Promise<boolean> => {
  const api = EN_WIKTIONARY_API;
  const params = new URLSearchParams({
    action: 'query',
    titles: title,
    format: 'json',
    formatversion: '2',
    origin: '*',
  });

  type MissingResponse = { query?: { pages?: Array<{ missing?: boolean }> } };
  const data = await fetchJson<MissingResponse>(`${api}?${params.toString()}`);
  const page = data?.query?.pages?.[0];
  return Boolean(data && page && page.missing);
};

/* ==========================================================================
   Wikitext parsing
   ========================================================================== */

/** Remove `{{template}}` calls, including nested ones. */
const stripTemplates = (input: string): string => {
  let result = '';
  let depth = 0;

  for (let i = 0; i < input.length; i += 1) {
    const two = input.slice(i, i + 2);
    if (two === '{{') {
      depth += 1;
      i += 1;
      continue;
    }
    if (two === '}}') {
      if (depth > 0) depth -= 1;
      i += 1;
      continue;
    }
    if (depth === 0) result += input[i];
  }

  return result;
};

/**
 * A few templates carry visible text that `stripTemplates` would otherwise
 * delete, leaving sentences truncated ("A mammal of the family"). Expand them
 * to plain text first.
 */
const expandReadableTemplates = (input: string): string =>
  input
    // {{taxfmt|Felidae|family}} -> Felidae
    .replace(/\{\{taxfmt\|([^|}]+)(?:\|[^}]*)?\}\}/g, '$1')
    // {{taxlink|Felidae|family}} -> Felidae
    .replace(/\{\{taxlink\|([^|}]+)(?:\|[^}]*)?\}\}/g, '$1')
    // {{vern|...}} -> final argument
    .replace(/\{\{vern\|[^|}]*\|([^|}]+)\}\}/g, '$1');

/** Turn wikitext links, bold/italic markers and HTML into plain readable text. */
const cleanWikitext = (input: string): string =>
  stripTemplates(expandReadableTemplates(input))
    .replace(/\[\[(?:[^\]|]*\|)?([^\]|]*)\]\]/g, '$1') // [[link|label]] -> label
    .replace(/'{2,3}/g, '') // bold / italic
    .replace(/<[^>]+>/g, '') // html tags
    .replace(/\s+/g, ' ')
    .trim();

/** Isolate the `==English==` block of a Wiktionary entry. */
const extractEnglishSection = (wikitext: string): string | null => {
  const start = wikitext.search(/^==\s*English\s*==\s*$/im);
  if (start === -1) return null;

  const afterHeading = wikitext.indexOf('\n', start);
  const rest = wikitext.slice(afterHeading === -1 ? start : afterHeading);

  // Stop at the next top-level (==) heading, which is another language.
  const nextLanguage = rest.search(/^==[^=\n][^\n]*==\s*$/m);
  return nextLanguage === -1 ? rest : rest.slice(0, nextLanguage);
};
/* ==========================================================================
   Part of speech handling
   ========================================================================== */

const POS_HEADINGS = new Set([
  'Noun',
  'Proper noun',
  'Verb',
  'Adjective',
  'Adverb',
  'Pronoun',
  'Determiner',
  'Preposition',
  'Conjunction',
  'Interjection',
  'Numeral',
  'Article',
  'Particle',
  'Prefix',
  'Suffix',
  'Infinitive',
  'Letter',
  'Phrase',
  'Proverb',
  'Idiom',
  'Romanization',
  'Abbreviation',
  'Contraction',
  'Gerund',
]);

/** Candidate part-of-speech sections, in the order learners care about most. */
const POS_PRIORITY = ['Noun', 'Proper noun', 'Verb', 'Adjective', 'Adverb'];

const POS_LABEL: Record<string, string> = {
  Noun: 'noun',
  'Proper noun': 'proper noun',
  Verb: 'verb',
  Adjective: 'adjective',
  Adverb: 'adverb',
  Pronoun: 'pronoun',
  Determiner: 'determiner',
  Preposition: 'preposition',
  Conjunction: 'conjunction',
  Interjection: 'interjection',
  Numeral: 'numeral',
  Article: 'article',
  Particle: 'particle',
  Prefix: 'prefix',
  Suffix: 'suffix',
  Infinitive: 'infinitive',
  Letter: 'letter',
  Phrase: 'phrase',
  Proverb: 'proverb',
  Idiom: 'idiom',
  Romanization: 'romanization',
  Abbreviation: 'abbreviation',
  Contraction: 'contraction',
  Gerund: 'gerund',
};

/** Isolate a `===Noun===` style part-of-speech block inside the English section. */
const extractPosSection = (englishSection: string, pos: string): string | null => {
  const heading = new RegExp(`^={3,4}\\s*${pos}\\s*={3,4}\\s*$`, 'im');
  const match = heading.exec(englishSection);
  if (!match) return null;

  const rest = englishSection.slice(match.index + match[0].length);
  const nextHeading = rest.search(/^={3,4}[^=\n][^\n]*={3,4}\s*$/m);
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading);
};

/** Collect the part-of-speech headings present, in document order. */
const listPartOfSpeechSections = (englishSection: string): string[] => {
  const found = new Set<string>();
  const heading = /^={3,4}\s*([^=\n][^\n]*?)\s*={3,4}\s*$/gm;
  let match = heading.exec(englishSection);

  while (match) {
    const title = match[1].trim();
    if (POS_HEADINGS.has(title)) found.add(title);
    match = heading.exec(englishSection);
  }

  return [...found];
};

/** Matches a definition that only points at another word, e.g. `{{plural of|en|ocean}}`. */
const isInflectionOnly = (definition: string): boolean =>
  /^\s*\{\{(?:plural|infl|inflection|alternative form|alternative spelling|misspelling|third-person singular|present participle|past participle|gerund) of\|/.test(
    definition
  );

/**
 * Definition lines start with `# `; `#*` sub-senses and `#:` glosses are skipped.
 * Some entries open a sense with a bare gloss template such as
 * `# {{n-g|Terms relating to animals.}}`, which carries no definition text,
 * so lines are considered until one yields readable prose.
 *
 * When the very first line only says "plural of X", the entry is an inflected
 * form and the caller should fall back to the base word instead.
 */
const extractDefinition = (posSection: string): string => {
  const lines = posSection.split('\n');

  for (const line of lines) {
    // `##`-style entries are used for sub-senses; accept both `#` and `##`.
    if (!/^#{1,2} [^:*]/.test(line)) continue;

    const body = line.replace(/^#+\s*/, '');

    // The head sense defers to another word: prefer that word's entry.
    if (isInflectionOnly(body)) return '';

    const text = cleanWikitext(body)
      .replace(/^[-–—]\s*/, '') // definitions sometimes open with a dash
      .replace(/[.;,]+$/, '')
      .trim();

    if (text) return text;
  }

  return '';
};

/** Usage examples live on `#:` lines using the `{{ux}}` template. */
const extractExample = (posSection: string): string | undefined => {
  const usage = /\{\{ux\|en\|([^|}]*)/.exec(posSection);
  if (usage) {
    const text = cleanWikitext(usage[1]).replace(/^["'“”]+|["'“”]+$/g, '').trim();
    if (text) return text;
  }

  // Fall back to a short citation passage, kept to its first sentence so the
  // popup stays compact.
  const citation = /\{\{quote-en\|en\|[^|}]*\|[^|}]*\|passage=([^|}]*)/.exec(posSection);
  if (citation) {
    const full = cleanWikitext(citation[1]).trim();
    const firstSentence = /^(.{15,180}?[.!?])(?:\s|$)/.exec(full);
    const text = firstSentence ? firstSentence[1] : full.length <= 180 ? full : '';

    if (text) return text;
  }

  return undefined;
};

/* ==========================================================================
   Pronunciation
   ========================================================================== */

/** `{{IPA|en|/ˈoʊ.ʃən/|a=US}}` -> US `/ˈoʊ.ʃən/` and UK `/ˈəʊ.ʃən/` transcriptions. */
const extractPronunciation = (
  englishSection: string
): { phonetic?: string; phoneticUk?: string; audioFile?: string } => {
  const US_ACCENTS = ['US', 'GA', 'GenAm', 'GenAm+'];
  const UK_ACCENTS = ['UK', 'RP'];

  let phoneticUs: string | undefined;
  let phoneticUk: string | undefined;
  let phoneticGeneric: string | undefined;
  let phoneticOther: string | undefined;

  const ipa = /\{\{IPA\|en\|([^}]*)\}\}/gi;
  let match = ipa.exec(englishSection);

  while (match) {
    const params = match[1];
    const accent = /a=([^|]*)/.exec(params);
    const form = params
      .split('|')
      .filter((part) => part.trim().startsWith('/'))
      .map((part) => cleanWikitext(part))[0];

    if (form) {
      // Accent labels can list several regions, e.g. `a=RP,GA,AU`.
      const labels = (accent ? accent[1] : '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

      if (labels.some((label) => US_ACCENTS.includes(label))) {
        phoneticUs = phoneticUs ?? form;
      } else if (labels.some((label) => UK_ACCENTS.includes(label))) {
        phoneticUk = phoneticUk ?? form;
      } else if (!labels.length) {
        phoneticGeneric = phoneticGeneric ?? form;
      } else {
        phoneticOther = phoneticOther ?? form;
      }
    }
    match = ipa.exec(englishSection);
  }

  const audio = /\{\{audio\|en\|([^|}]*)/.exec(englishSection);
  const audioFile = audio ? cleanWikitext(audio[1]) : undefined;

  // Prefer a US transcription, then the generic/primary one, then UK.
  const phonetic = phoneticUs ?? phoneticGeneric ?? phoneticUk ?? phoneticOther;

  return { phonetic, phoneticUk, audioFile };
};

/* ==========================================================================
   Word normalization
   ========================================================================== */

/**
 * Wiktionary marks inflected forms explicitly, e.g. `{{plural of|en|ocean}}`.
 * Return the base word when the entry is only an inflected form.
 */
const extractLemma = (wikitext: string): string | null => {
  const englishSection = extractEnglishSection(wikitext);
  const scope = englishSection ?? wikitext;

  const patterns = [
    /\{\{(?:plural|simple past and past participle|third-person singular|present participle|past participle|gerund|infl|inflection|alternative form|alternative spelling|misspelling|comparative|superlative) of\|en\|([^|}\s]+)/i,
    /\{\{head\|en\|[^}]*?form\s*of\|en\|([^|}\s]+)/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(scope);
    if (match) return cleanWikitext(match[1]).toLowerCase();
  }

  return null;
};

/**
 * Last-resort de-inflection for the simple plural cases only. Used when
 * Wiktionary has no usable entry at all for the selected form.
 */
const simpleBaseForms = (word: string): string[] => {
  const candidates: string[] = [];

  if (word.length > 4 && word.endsWith('ies')) {
    candidates.push(`${word.slice(0, -3)}y`);
  } else if (word.length > 4 && /(ches|shes|sses|xes|zes)$/.test(word)) {
    candidates.push(word.slice(0, -2));
  } else if (word.length > 3 && word.endsWith('es')) {
    candidates.push(word.slice(0, -1), word.slice(0, -2));
  } else if (word.length > 2 && word.endsWith('s') && !word.endsWith('ss')) {
    candidates.push(word.slice(0, -1));
  }

  return candidates.filter((item) => item.length > 1);
};

/* ==========================================================================
   Vietnamese meaning
   ========================================================================== */

/**
 * The Vietnamese Wiktionary lists native-language glosses under the `{{-eng-}}`
 * section (e.g. "Đại dương, biển"). This is a curated dictionary gloss,
 * not a guess.
 */
const extractVietnameseGloss = (wikitext: string): string | undefined => {
  const englishStart = wikitext.indexOf('{{-eng-}}');
  if (englishStart === -1) return undefined;

  const rest = wikitext.slice(englishStart + '{{-eng-}}'.length);
  // Stop before the next language block.
  const nextLanguage = rest.search(/\{\{-(?!eng-)[a-z]{2,3}?[a-z-]*-\}\}/i);
  const block = nextLanguage === -1 ? rest : rest.slice(0, nextLanguage);

  const definition = /^#\s+([^#\n][^\n]*)/m.exec(block);
  if (!definition) return undefined;

  const gloss = cleanWikitext(definition[1]).replace(/[.;,]+$/, '').trim();
  return gloss || undefined;
};

/** Machine-translation fallback used when Wiktionary has no Vietnamese entry. */
const translateToVietnamese = async (text: string): Promise<string | undefined> => {
  const cacheKey = `vi-tr:${text}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value ?? undefined;

  const params = new URLSearchParams({ q: text, langpair: 'en|vi' });
  type MemoryResponse = { responseData?: { translatedText?: string }; responseStatus?: number };
  const data = await fetchJson<MemoryResponse>(`${MYMEMORY_API}?${params.toString()}`);

  const raw = data?.responseData?.translatedText?.trim();
  // MyMemory returns quota and validation notices in the same field.
  const translated =
    data?.responseStatus === 200 && raw && !/MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID/i.test(raw)
      ? raw
      : null;

  cache.set(cacheKey, { value: translated, expiresAt: Date.now() + CACHE_TTL_MS });
  return translated ?? undefined;
};
/* ==========================================================================
   Public API
   ========================================================================== */

/** An entry is usable only when it carries a real definition, not just an inflection note. */
const hasUsableDefinition = (wikitext: string): boolean => {
  const englishSection = extractEnglishSection(wikitext);
  if (!englishSection) return false;

  return listPartOfSpeechSections(englishSection).some((pos) => {
    const section = extractPosSection(englishSection, pos);
    return section ? Boolean(extractDefinition(section)) : false;
  });
};

/**
 * Look up a single English word and return a normalised dictionary entry.
 *
 * Resolution order: the word itself, then the lemma Wiktionary declares
 * (e.g. "oceans" -> "ocean"), then a simple plural fallback.
 *
 * @throws {DictionaryLookupError} kind `network` when no source responds,
 * kind `not-found` when no source has an entry for the word.
 */
export const fetchDictionaryEntry = async (rawWord: string): Promise<DictionaryEntry> => {
  const word = rawWord.trim().toLowerCase();

  if (!word) {
    throw new DictionaryLookupError('not-found');
  }

  const wordWikitext = await fetchWikitext('en', word);

  // Build the list of candidate headwords to try, most likely first.
  const candidates: string[] = [word];
  const lemma = wordWikitext ? extractLemma(wordWikitext) : null;
  if (lemma && lemma !== word) candidates.push(lemma);
  if (!wordWikitext || !hasUsableDefinition(wordWikitext)) {
    candidates.push(...simpleBaseForms(word));
  }

  let source: string | null = null;
  let headword = word;
  // Every candidate we tried, and whether each one is *known* to be absent.
  // An entry that exists but only holds "{{plural of}}" does not count: the
  // lemma candidate still has to be resolved.
  let triedCount = 0;
  let confirmedMissingCount = 0;

  for (const candidate of candidates) {
    triedCount += 1;
    const wikitext = candidate === word ? wordWikitext : await fetchWikitext('en', candidate);

    if (wikitext) {
      if (hasUsableDefinition(wikitext)) {
        source = wikitext;
        headword = candidate;
        break;
      }
      // The entry exists but holds no definition of its own.
      confirmedMissingCount += 1;
    } else if (await pageIsConfirmedMissing(candidate)) {
      confirmedMissingCount += 1;
    }
  }

  if (!source) {
    // Only report "not found" when every candidate is confirmed to have no
    // definition; otherwise the lookup failed for a transport-level reason.
    const notFound = confirmedMissingCount === triedCount;
    throw new DictionaryLookupError(notFound ? 'not-found' : 'network');
  }

  const englishSection = extractEnglishSection(source);
  if (!englishSection) {
    throw new DictionaryLookupError('not-found');
  }

  const available = listPartOfSpeechSections(englishSection);
  const pos = POS_PRIORITY.find((item) => available.includes(item)) ?? available[0];

  if (!pos) {
    throw new DictionaryLookupError('not-found');
  }

  const posSection = extractPosSection(englishSection, pos) ?? '';
  const meaning = extractDefinition(posSection);

  if (!meaning) {
    throw new DictionaryLookupError('not-found');
  }

  const { phonetic, phoneticUk, audioFile } = extractPronunciation(englishSection);
  const example = extractExample(posSection);

  // Vietnamese meaning: curated Wiktionary gloss first, machine translation second.
  const viWikitext = await fetchWikitext('vi', headword);
  const meaningVi =
    (viWikitext ? extractVietnameseGloss(viWikitext) : undefined) ??
    (await translateToVietnamese(headword));

  const exampleVi = example ? await translateToVietnamese(example) : undefined;

  return {
    word: headword,
    phonetic,
    phoneticUk,
    partOfSpeech: POS_LABEL[pos] ?? pos.toLowerCase(),
    meaning,
    meaningVi,
    example,
    exampleVi,
    audioUrl: audioFile ? `${COMMONS_FILE_PATH}${audioFile}` : undefined,
  };
};

/** Human readable message for a failed lookup. Never exposes a raw API error. */
export const dictionaryErrorMessage = (error: unknown): string => {
  if (error instanceof DictionaryLookupError && error.kind === 'not-found') {
    return 'Could not find a definition for this word.';
  }

  return 'Dictionary is temporarily unavailable. Please try again.';
};