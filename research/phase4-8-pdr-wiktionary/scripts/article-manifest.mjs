/**
 * The 10 articles in this batch, with their Library editorial mapping.
 *
 * Fields per row:
 *   [slug, sourceId, canonicalUrl, genre, level, contentType,
 *    primaryCategory, [secondaryCategories], curiosityTopic, whyThisGenre]
 *
 * Both shelves were filled from items whose OWN page carries per-item Creative
 * Commons evidence (see audit-pdr.mjs / audit-wiktionary.mjs). Nothing here is
 * eligible merely because the publisher is on a whitelist.
 *
 * `curiosityTopic` is the "Curiosities & Deep Dives" shelf the article belongs
 * to. It is recorded here as the editorial decision for the batch and is carried
 * into the import as part of the classification, so the shelf is decided once
 * and auditable rather than guessed later.
 *
 * `genre` and `level` are Library editorial mappings, not publisher-claimed
 * labels. Reading time is derived from the extracted word count at 200 WPM.
 *
 * AUDITED AND EXCLUDED (real findings, see the batch README):
 *   essay/ars-notoria ............... "All rights reserved", not CC BY-SA
 *   essay/the-great-majority ........ "All rights reserved", not CC BY-SA
 *   essay/parodies-of-pedantry ...... "Reprinted by permission of Princeton UP"
 *   essay/twilight-of-the-velocipede . "Reprinted by permission of Basic Books"
 *   essay/magic-by-return-of-post ... article is CC BY-SA; its IMAGES are
 *                                    IAPSOP (CC BY-NC) and are excluded, so the
 *                                    text-only import is eligible
 *   collection/marnameh ............. CC BY-NC-SA only (non-commercial)
 *   collection/brahan-seer .......... CC BY-NC-SA only (non-commercial)
 *   collection/of-the-sympathetick-powder .. CC BY-NC-SA only (non-commercial)
 */
export const ARTICLES = [
  // ---- Mythology, Folklore & Dark History (5) ----
  ['the-mowing-devil', 'public-domain-review',
    'https://publicdomainreview.org/collection/the-mowing-devil/',
    'History', 'B1', 'expository', 'history', ['culture'],
    'Mythology, Folklore & Dark History',
    'The 1678 "Mowing-Devil" woodcut and the folklore of crop circles and devils.'],
  ['animal-vegetable-lamb', 'public-domain-review',
    'https://publicdomainreview.org/essay/animal-vegetable-lamb/',
    'History', 'B2', 'expository', 'history', ['culture'],
    'Mythology, Folklore & Dark History',
    'The Vegetable Lamb of Tartary: a medieval prodigy, its hoaxes and its origins.'],
  ['glass-delusion', 'public-domain-review',
    'https://publicdomainreview.org/essay/fear-and-fragility-the-glass-delusion-and-its-history/',
    'History', 'B2', 'expository', 'history', ['psychology'],
    'Mythology, Folklore & Dark History',
    'Early-modern belief that the body was made of glass, and what it reveals.'],
  ['maskenfest', 'public-domain-review',
    'https://publicdomainreview.org/collection/maskenfest/',
    'Culture, Art & Travel', 'A2', 'expository', 'culture', ['history'],
    'Mythology, Folklore & Dark History',
    'Photographed costumes from an 1862 Munich fairytale costume ball.'],
  ['mail-order-occult', 'public-domain-review',
    'https://publicdomainreview.org/essay/magic-by-return-of-post/',
    'History', 'B2', 'expository', 'history', ['culture'],
    'Mythology, Folklore & Dark History',
    'How mail-order courses and print carried the occult into American life.'],

  // ---- Linguistics & Etymology (5) ----
  ['salary', 'wiktionary', 'https://en.wiktionary.org/wiki/salary',
    'Education', 'B1', 'educational', 'language-learning', ['education'],
    'Linguistics & Etymology',
    'From Latin salarium: how "salary" came to be linked with salt.'],
  ['quarantine', 'wiktionary', 'https://en.wiktionary.org/wiki/quarantine',
    'Education', 'B2', 'educational', 'language-learning', ['history'],
    'Linguistics & Etymology',
    'From the Latin forty: the word behind quarantine and its legal history.'],
  ['window', 'wiktionary', 'https://en.wiktionary.org/wiki/window',
    'Education', 'B1', 'educational', 'language-learning', [],
    'Linguistics & Etymology',
    'From Old Norse vindauga, "wind-eye": the eye of the wind.'],
  ['posh', 'wiktionary', 'https://en.wiktionary.org/wiki/posh',
    'Education', 'A2', 'educational', 'language-learning', [],
    'Linguistics & Etymology',
    'A word whose confident origin story turns out to be a myth.'],
  ['gossip', 'wiktionary', 'https://en.wiktionary.org/wiki/gossip',
    'Education', 'B1', 'educational', 'language-learning', [],
    'Linguistics & Etymology',
    'From godparent: how a word for a kinsman became idle talk.'],
];