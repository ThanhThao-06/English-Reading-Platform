/**
 * The 10 articles in this batch, with their Library editorial mapping.
 *
 * Fields per row:
 *   [slug, sourceId, canonicalUrl, genre, level, contentType,
 *    primaryCategory, [secondaryCategories], curiosityTopic, whyThisGenre]
 *
 * Selection basis (no new research): every row comes from artifacts that already
 * existed in Phase 4.8 - the PDR audit (pdr-audit.json), the Wiktionary audit
 * (wiktionary-audit.json) and the per-item licence probe (pdr-licence-probe.json).
 * Both shelves are filled from items whose OWN page must carry per-item Creative
 * Commons evidence at build time (see build-packages.mjs / pdr-extract.mjs).
 * Nothing here is eligible merely because the publisher is on a whitelist.
 *
 * `curiosityTopic` is the "Curiosities & Deep Dives" shelf the article belongs
 * to. It is recorded here as the editorial decision for the batch and is carried
 * into the import as part of the classification, so the shelf is decided once
 * and auditable rather than guessed later.
 *
 * `genre` and `level` are Library editorial mappings, not publisher-claimed
 * labels. Reading time is derived from the extracted word count at 200 WPM.
 *
 * KNOWN RIGHTS FINDINGS CARRIED FROM THE EXISTING AUDITS (the build re-checks
 * each item's own page and the outcome of record is build-outcomes.json):
 *   collection/the-tragical-death-of-a-apple-pye ... no article-level CC in audit
 *   collection/dream-of-a-rarebit-fiend-1906 ...... no article-level CC in audit
 *   collection/giant-produce-postcards ............ no article-level CC in audit
 *   collection/women-having-tea-in-napier ......... no article-level CC in audit
 *   essay/twilight-of-the-velocipede .............. "Reprinted by permission of
 *                                    Basic Books" + "All rights reserved" (probe)
 *   essay/the-blinkered-flaneur / typing-for-love-or-money / cybernetic-attention
 *                                    carry a bare "CC BY-SA" line in the probe;
 *                                    the build accepts them only if the item's own
 *                                    page yields a full article-level licence token.
 *   wiktionary words all audited AUDITED with the CC BY-SA footer; words under
 *                                    120 clean words are SKIPped as thin bodies.
 */
export const ARTICLES = [
  // ---- Gastronomy & Food History (5) ----
  ['the-tragical-death-of-a-apple-pye', 'public-domain-review',
    'https://publicdomainreview.org/collection/the-tragical-death-of-a-apple-pye/',
    'Culture, Art & Travel', 'B1', 'expository', 'food', ['history'],
    'Gastronomy & Food History',
    'A broadside ballad about the making and fate of a "good apple-pye": food in popular print.'],
  ['rarebit-fiend', 'public-domain-review',
    'https://publicdomainreview.org/collection/dream-of-a-rarebit-fiend-1906/',
    'Culture, Art & Travel', 'B1', 'expository', 'food', ['art'],
    'Gastronomy & Food History',
    'Winsor McCay\'s "Dream of a Rarebit Fiend" (1906): the cheese dish that sends sleepers into nightmare.'],
  ['giant-produce-postcards', 'public-domain-review',
    'https://publicdomainreview.org/collection/giant-produce-postcards/',
    'Science & Nature', 'B1', 'expository', 'food', ['history'],
    'Gastronomy & Food History',
    'Postcards of oversized vegetables and fruits: agricultural showpieces as food history.'],
  ['women-having-tea', 'public-domain-review',
    'https://publicdomainreview.org/collection/women-having-tea-in-napier-new-zealand-ca-1890/',
    'Culture, Art & Travel', 'A2', 'expository', 'food', ['history'],
    'Gastronomy & Food History',
    'A photographic record of tea drinking in Napier, New Zealand, ca. 1890: an everyday food ritual on camera.'],
  ['dandelion', 'wiktionary', 'https://en.wiktionary.org/wiki/dandelion',
    'Education', 'B1', 'educational', 'language-learning', ['food'],
    'Gastronomy & Food History',
    'From Latin dens leonis, "lion\'s tooth": a plant that passed from herbals into salads and wine.'],

  // ---- Urbanism & Everyday Objects (5) ----
  ['the-blinkered-flaneur', 'public-domain-review',
    'https://publicdomainreview.org/essay/the-blinkered-flaneur/',
    'History', 'B2', 'expository', 'history', ['culture'],
    'Urbanism & Everyday Objects',
    'Walking with Franz Hessel in 1920s Berlin: the flaneur and the modern city.'],
  ['typing-for-love-or-money', 'public-domain-review',
    'https://publicdomainreview.org/essay/typing-for-love-or-money/',
    'History', 'B2', 'expository', 'history', ['society'],
    'Urbanism & Everyday Objects',
    'The hidden women\'s typing labour behind modern literary masterpieces: the typewriter as an everyday object.'],
  ['cybernetic-attention', 'public-domain-review',
    'https://publicdomainreview.org/essay/cybernetic-attention/',
    'Technology & AI', 'B2', 'expository', 'technology', ['psychology'],
    'Urbanism & Everyday Objects',
    'All watched over by machines: how everyday technology reshaped human attention.'],
  ['robot', 'wiktionary', 'https://en.wiktionary.org/wiki/robot',
    'Education', 'B2', 'educational', 'language-learning', ['technology'],
    'Urbanism & Everyday Objects',
    'From Czech robota, "forced labour": the word behind an everyday machine.'],
  ['twilight-of-the-velocipede', 'public-domain-review',
    'https://publicdomainreview.org/essay/twilight-of-the-velocipede/',
    'History', 'B2', 'expository', 'history', ['technology'],
    'Urbanism & Everyday Objects',
    'Typesetting races before Linotype: the velocipede and the machinery of print.'],
];
