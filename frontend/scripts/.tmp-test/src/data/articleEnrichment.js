"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getArticleCuriosity = exports.getArticleEnrichment = exports.ARTICLE_ENRICHMENTS = void 0;
/**
 * Phase 3.1 - Optional metadata for articles, keyed by article id.
 *
 * This registry exists so metadata can be added to the library WITHOUT editing
 * `data/articles.ts`. Keeping it in a separate file has three practical
 * benefits:
 *
 * 1. Article text, ids and chapter indexes cannot be disturbed while adding
 *    metadata. `articles.ts` stays exactly as it is.
 * 2. A metadata mistake can never break reading: a missing or wrong entry here
 *    only means an article has less filtering detail, not that it fails to open.
 * 3. Provenance and licence facts can be added slowly, as each one is actually
 *    verified, instead of all at once.
 *
 * IMPORTANT - what must never appear here:
 *
 * - No article `content`, and no duplicate copy of any `Article` field.
 * - No invented authors, publication dates, URLs, publishers or licences. An
 *   absent field means "not established yet", which is honest; a guessed field
 *   is not.
 * - No `source` or `license` entry merely because a piece of content looks old
 *   or is freely readable online. Reuse rights are only recorded once verified,
 *   and `data/articles.ts` currently contains no third-party sourced text, so
 *   every entry below correctly leaves `source` and `license` unset.
 *
 * Articles with no entry at all are perfectly valid and are treated exactly as
 * before by the rest of the app.
 */
exports.ARTICLE_ENRICHMENTS = {
    // Deep-sea hydrothermal vents: marine geology, chemosynthesis and the search
    // for life off Earth. Scientific explainer, not a news report.
    'art-001': {
        contentType: 'expository',
        categories: ['science', 'environment'],
        language: 'en',
    },
    // Automation in global logistics. Business and technology reporting; the text
    // discusses ports in several countries but is not about any one of them.
    'art-002': {
        contentType: 'expository',
        categories: ['business', 'technology'],
        language: 'en',
    },
    // Urban rewilding. Environmental topic with a social/urban angle; named
    // cities appear as examples rather than as the article's subject.
    'art-003': {
        contentType: 'expository',
        categories: ['environment', 'society'],
        language: 'en',
    },
    // Solar cell efficiency records. Presented as a current research report, so
    // 'news' reflects the form the text actually takes.
    'art-004': {
        contentType: 'news',
        categories: ['science', 'technology', 'environment'],
        language: 'en',
    },
    // "Part 1" of a titled story set in Prague. The title itself states both the
    // series and the part number, so this is recorded rather than inferred. No
    // totalParts value: the number of parts is not established.
    'art-005': {
        contentType: 'short-story',
        categories: ['literature'],
        countriesAbout: ['CZ'],
        language: 'en',
        series: {
            title: 'The Clockmaker of Prague',
            partNumber: 1,
        },
    },
    // Atmospheric microplastics affecting cloud formation. Science explainer.
    'art-006': {
        contentType: 'expository',
        categories: ['science', 'environment'],
        language: 'en',
    },
    // Circular economy applied to retail. Business strategy with an
    // environmental angle.
    'art-007': {
        contentType: 'expository',
        categories: ['business', 'environment'],
        language: 'en',
    },
    // Oral storytelling in early societies. History and anthropology.
    'art-008': {
        contentType: 'expository',
        categories: ['history', 'culture'],
        language: 'en',
    },
    // A simple narrative walk through a forest. Fiction, with no country focus.
    'art-009': {
        contentType: 'short-story',
        categories: ['literature'],
        language: 'en',
    },
    // Habit formation and attention. Behavioural psychology with a practical
    // self-development angle; recorded as expository because the text explains
    // research rather than reporting a dated event.
    'art-010': {
        contentType: 'expository',
        categories: ['psychology', 'education'],
        language: 'en',
    },
    /* ==========================================================================
       "Curiosities & Deep Dives" shelves - imported articles (Phase 4.8).
  
       These ten articles were imported from The Public Domain Review and
       Wiktionary under verified CC BY / CC BY-SA terms. Their ids are the
       `library_content` row ids the API returns, so the shelf a card is filed under
       is resolved from this registry rather than being re-derived from the text.
  
       The `primaryCategory` values below are the ones already recorded on each
       imported package; they are listed here only to make the existing entry
       readable. What the Library needs from these entries is the shelf.
       ========================================================================== */
    // --- Mythology, Folklore & Dark History (5) ---
    'imported-44ff5e66fa4a321ca3229c95': {
        contentType: 'expository',
        categories: ['history', 'culture'],
        language: 'en',
        curiosity: 'Mythology, Folklore & Dark History',
    },
    'imported-93aeabf2be9afa26997bd5f9': {
        contentType: 'expository',
        categories: ['history', 'culture'],
        language: 'en',
        curiosity: 'Mythology, Folklore & Dark History',
    },
    'imported-2f0d27a53aaa2a565c913cac': {
        contentType: 'expository',
        categories: ['history', 'psychology'],
        language: 'en',
        curiosity: 'Mythology, Folklore & Dark History',
    },
    'imported-c695c0fdcd525baf75995021': {
        contentType: 'expository',
        categories: ['culture', 'history'],
        language: 'en',
        curiosity: 'Mythology, Folklore & Dark History',
    },
    'imported-c2871ff9027252bf191c5c82': {
        contentType: 'expository',
        categories: ['history', 'culture'],
        language: 'en',
        curiosity: 'Mythology, Folklore & Dark History',
    },
    // --- Linguistics & Etymology (5) ---
    'imported-9438f9bbb8e60707c44b4ab2': {
        contentType: 'educational',
        categories: ['language-learning', 'education'],
        language: 'en',
        curiosity: 'Linguistics & Etymology',
    },
    'imported-0cc94fd55507d159ba2b4abb': {
        contentType: 'educational',
        categories: ['language-learning', 'history'],
        language: 'en',
        curiosity: 'Linguistics & Etymology',
    },
    'imported-a70909e2fe06fe6c163e02df': {
        contentType: 'educational',
        categories: ['language-learning'],
        language: 'en',
        curiosity: 'Linguistics & Etymology',
    },
    'imported-d16852c908cf3f8396c39577': {
        contentType: 'educational',
        categories: ['language-learning'],
        language: 'en',
        curiosity: 'Linguistics & Etymology',
    },
    'imported-81c89ab2b5773e573ae13c24': {
        contentType: 'educational',
        categories: ['language-learning'],
        language: 'en',
        curiosity: 'Linguistics & Etymology',
    },
    /* ==========================================================================
       "Curiosities & Deep Dives" shelves - imported articles (Phase 4.9).
  
       The five articles of import batch 604dc181-3666-4898-9387-6b2fcba6c9a4
       that passed the rights build (the batch manifest planned ten; five were
       rejected by the per-item licence re-check and never imported). Their ids
       are the `library_content` row ids the API returns, and the shelf each one
       sits on is the `curiosityTopic` editorial decision recorded in
       `research/phase4-9-gastronomy-urbanism/scripts/article-manifest.mjs`.
  
       `contentType`, `categories` and `language` below mirror the stored package
       classification for each row exactly; they record no fact the package does
       not already carry.
       ========================================================================== */
    // --- Gastronomy & Food History (1) ---
    // "dandelion" - from Latin dens leonis, "lion's tooth": a plant that passed
    // from herbals into salads and wine.
    'imported-0720a0c22c2e0cc59d04c919': {
        contentType: 'educational',
        categories: ['language-learning', 'food'],
        language: 'en',
        curiosity: 'Gastronomy & Food History',
    },
    // --- Urbanism & Everyday Objects (4) ---
    // "The Blinkered Flaneur" - walking with Franz Hessel in 1920s Berlin: the
    // flaneur and the modern city.
    'imported-9a88313ef92f1924330d8474': {
        contentType: 'expository',
        categories: ['history', 'culture'],
        language: 'en',
        curiosity: 'Urbanism & Everyday Objects',
    },
    // "Typing for Love or Money" - the hidden women's typing labour behind modern
    // literary masterpieces: the typewriter as an everyday object.
    'imported-da1dd0d02aa2b239276a1493': {
        contentType: 'expository',
        categories: ['history', 'society'],
        language: 'en',
        curiosity: 'Urbanism & Everyday Objects',
    },
    // "Cybernetic Attention" - all watched over by machines: how everyday
    // technology reshaped human attention.
    'imported-3f3c0e01482d96fd29d2450b': {
        contentType: 'expository',
        categories: ['technology', 'psychology'],
        language: 'en',
        curiosity: 'Urbanism & Everyday Objects',
    },
    // "robot" - from Czech robota, "forced labour": the word behind an everyday
    // machine.
    'imported-78a6d5f186dfcfa470ae2483': {
        contentType: 'educational',
        categories: ['language-learning', 'technology'],
        language: 'en',
        curiosity: 'Urbanism & Everyday Objects',
    },
};
/**
 * Metadata for one article id, or `undefined` when none has been recorded.
 *
 * Purely a lookup: it performs no inference, never falls back to defaults, and
 * never invents a category. An article without an entry simply has no extra
 * metadata, which is a supported state rather than a data problem.
 */
const getArticleEnrichment = (articleId) => {
    if (!articleId)
        return undefined;
    return exports.ARTICLE_ENRICHMENTS[articleId];
};
exports.getArticleEnrichment = getArticleEnrichment;
/**
 * The curiosity shelf one article is filed under, or `undefined` when none is.
 *
 * A pure lookup: it never infers a shelf from `genre` or from categories,
 * because the shelves are an editorial judgement rather than something derivable
 * from the text. An untagged article simply has no shelf, which is a normal
 * state and not a data problem.
 */
const getArticleCuriosity = (articleId) => {
    if (!articleId)
        return undefined;
    return exports.ARTICLE_ENRICHMENTS[articleId]?.curiosity;
};
exports.getArticleCuriosity = getArticleCuriosity;
