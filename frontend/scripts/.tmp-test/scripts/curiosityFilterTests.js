"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 4.8 - "Curiosities & Deep Dives" shelf filtering, checked against the
 * REAL article data the Library actually receives.
 *
 * This half of the suite does not trust a hand-made fixture: it reads the live
 * `/api/library/articles` response when a server is reachable, falls back to the
 * imported article ids recorded by the batch, and runs the REAL
 * `matchesLibraryFilters` predicate over them. It fails if the shipped registry
 * and the shipped filter disagree about which shelf an article is on.
 *
 * Compiled standalone (outside the app's tsconfig) and run under plain Node, in
 * the same way as the other `scripts/*Tests.ts` harnesses.
 *
 * It covers all four shelves that currently hold articles: the Phase 4.8 pair
 * (Mythology, Folklore & Dark History / Linguistics & Etymology) and the
 * Phase 4.9 pair (Gastronomy & Food History / Urbanism & Everyday Objects).
 */
const articleEnrichment_1 = require("../src/data/articleEnrichment");
const libraryBrowse_1 = require("../src/utils/libraryBrowse");
let passed = 0;
const failures = [];
const check = (label, condition, detail = '') => {
    if (condition) {
        passed += 1;
        console.log(`PASS ${label}${detail ? ` :: ${detail}` : ''}`);
    }
    else {
        failures.push(detail ? `${label} :: ${detail}` : label);
        console.log(`FAIL ${label}${detail ? ` :: ${detail}` : ''}`);
    }
};
const NO_FILTERS = {
    searchQuery: '',
    genre: 'All',
    level: 'All',
    readingTime: 'All',
    curiosity: 'All',
};
const filtersWith = (overrides) => ({
    ...NO_FILTERS,
    ...overrides,
});
/**
 * Build a card exactly as the Library does: the API shape plus the shelf
 * resolved from the registry. `withCuriosity` is mirrored here from
 * `hooks/useLibraryData.ts` so the test can drive real ids.
 */
const cardFor = (id, overrides = {}) => {
    const curiosity = (0, articleEnrichment_1.getArticleCuriosity)(id);
    return {
        id,
        title: id,
        description: '',
        image: null,
        genre: 'History',
        level: 'B1',
        readingTime: 'Under 3 min',
        ...(curiosity ? { curiosity } : {}),
        ...overrides,
    };
};
const MYTHOLOGY = 'Mythology, Folklore & Dark History';
const LINGUISTICS = 'Linguistics & Etymology';
const GASTRONOMY = 'Gastronomy & Food History';
const URBANISM = 'Urbanism & Everyday Objects';
// --- the registry itself ----------------------------------------------------
const mythIds = Object.keys(articleEnrichment_1.ARTICLE_ENRICHMENTS).filter((id) => (0, articleEnrichment_1.getArticleCuriosity)(id) === MYTHOLOGY);
const linguisticsIds = Object.keys(articleEnrichment_1.ARTICLE_ENRICHMENTS).filter((id) => (0, articleEnrichment_1.getArticleCuriosity)(id) === LINGUISTICS);
const gastronomyIds = Object.keys(articleEnrichment_1.ARTICLE_ENRICHMENTS).filter((id) => (0, articleEnrichment_1.getArticleCuriosity)(id) === GASTRONOMY);
const urbanismIds = Object.keys(articleEnrichment_1.ARTICLE_ENRICHMENTS).filter((id) => (0, articleEnrichment_1.getArticleCuriosity)(id) === URBANISM);
check('five articles are filed under Mythology, Folklore & Dark History', mythIds.length === 5, `got ${mythIds.length}`);
check('five articles are filed under Linguistics & Etymology', linguisticsIds.length === 5, `got ${linguisticsIds.length}`);
check('one article is filed under Gastronomy & Food History', gastronomyIds.length === 1, `got ${gastronomyIds.length}`);
check('four articles are filed under Urbanism & Everyday Objects', urbanismIds.length === 4, `got ${urbanismIds.length}`);
check('every shelved registry entry sits on one of the four filled shelves', [...mythIds, ...linguisticsIds, ...gastronomyIds, ...urbanismIds].length
    === Object.keys(articleEnrichment_1.ARTICLE_ENRICHMENTS).filter((id) => (0, articleEnrichment_1.getArticleCuriosity)(id)).length);
// --- the two required shelf selections --------------------------------------
const allTen = [...mythIds, ...linguisticsIds].map((id) => cardFor(id));
const underMyth = allTen.filter((card) => (0, libraryBrowse_1.matchesLibraryFilters)(card, filtersWith({ curiosity: MYTHOLOGY })));
const underLinguistics = allTen.filter((card) => (0, libraryBrowse_1.matchesLibraryFilters)(card, filtersWith({ curiosity: LINGUISTICS })));
check('selecting "Mythology, Folklore & Dark History" yields 5 articles', underMyth.length === 5, `got ${underMyth.length}`);
check('selecting "Linguistics & Etymology" yields 5 articles', underLinguistics.length === 5, `got ${underLinguistics.length}`);
// --- 'All' shows everything -------------------------------------------------
const untagged = cardFor('art-001');
const everything = [...allTen, untagged];
check('"All" keeps every article, tagged or not', everything.every((card) => (0, libraryBrowse_1.matchesLibraryFilters)(card, filtersWith({ curiosity: 'All' }))));
check('an untagged article matches no specific shelf', !(0, libraryBrowse_1.matchesLibraryFilters)(untagged, filtersWith({ curiosity: MYTHOLOGY }))
    && !(0, libraryBrowse_1.matchesLibraryFilters)(untagged, filtersWith({ curiosity: LINGUISTICS })));
// --- the shelf narrows alongside the other filters, never replaces them ------
const mixed = [
    cardFor(mythIds[0], { genre: 'History' }),
    cardFor(mythIds[1], { genre: 'Education' }),
    cardFor(linguisticsIds[0], { genre: 'History' }),
];
const shelfThenGenre = mixed.filter((card) => (0, libraryBrowse_1.matchesLibraryFilters)(card, filtersWith({ curiosity: MYTHOLOGY, genre: 'History' })));
check('curiosity and genre narrow together (shelf AND genre)', shelfThenGenre.length === 1, `got ${shelfThenGenre.length}`);
check('that combined result is on the right shelf', shelfThenGenre[0]?.curiosity === MYTHOLOGY);
const shelfThenLevel = mixed.filter((card) => (0, libraryBrowse_1.matchesLibraryFilters)(card, filtersWith({ curiosity: LINGUISTICS, level: 'B1' })));
check('curiosity and level narrow together', shelfThenLevel.length === 1, `got ${shelfThenLevel.length}`);
check('curiosity and reading time narrow together', mixed.filter((card) => (0, libraryBrowse_1.matchesLibraryFilters)(card, filtersWith({ curiosity: MYTHOLOGY, readingTime: 'Chapter' }))).length === 0);
check('a conflicting filter combination yields nothing', mixed.filter((card) => (0, libraryBrowse_1.matchesLibraryFilters)(card, filtersWith({ curiosity: LINGUISTICS, genre: 'Environment' }))).length === 0);
// --- existing behaviour is preserved -----------------------------------------
check('title search still works alongside a shelf', mixed.filter((card) => (0, libraryBrowse_1.matchesLibraryFilters)(card, filtersWith({ curiosity: MYTHOLOGY, searchQuery: mythIds[0] }))).length === 1);
check('the other three filters are unaffected when curiosity is "All"', mixed.every((card) => (0, libraryBrowse_1.matchesLibraryFilters)(card, filtersWith({
    genre: card.genre, level: card.level, readingTime: card.readingTime,
}))));
check('genre filtering alone still narrows correctly', mixed.filter((card) => (0, libraryBrowse_1.matchesLibraryFilters)(card, filtersWith({ genre: 'History' }))).length === 2);
/* ==========================================================================
   End-to-end: the REAL article ids the Library receives
   ========================================================================== */
/**
 * Load the REAL article ids the Library receives.
 *
 * The backend assigns each imported row the id
 * `imported-${sha256(`${packageId}@${version}`).slice(0, 24)}`, so the real ids
 * are derived here from the actual approved packages on disk. That keeps this
 * check honest offline: it fails if a package is re-keyed, re-versioned or
 * removed without the shelf registry being updated to match.
 *
 * A live API is preferred when one is running, and is requested
 * synchronously via `execSync` because this harness compiles to CommonJS, where
 * top-level `await` is not available.
 */
const loadRealIds = () => {
    const { execSync } = require('child_process');
    const fs = require('fs');
    const { createHash } = require('crypto');
    try {
        const body = execSync('curl -s --max-time 5 http://localhost:4174/api/library/articles', { encoding: 'utf8', timeout: 8000 });
        const payload = JSON.parse(body);
        if (Array.isArray(payload.articles) && payload.articles.length > 0) {
            return { ids: payload.articles.map((a) => a.id), source: 'live API' };
        }
    }
    catch {
        // No server reachable; derive the ids from the packages instead.
    }
    // This harness runs with `frontend` as the working directory.
    const packageDir = '../research/phase3-7-approved-content-package/approved-content';
    if (!fs.existsSync(packageDir))
        return { ids: [], source: 'none' };
    const ids = [];
    for (const name of fs.readdirSync(packageDir)) {
        if (!name.endsWith('.json'))
            continue;
        let pkg;
        try {
            pkg = JSON.parse(fs.readFileSync(`${packageDir}/${name}`, 'utf8'));
        }
        catch {
            continue;
        }
        if (!pkg.packageId || typeof pkg.version !== 'number')
            continue;
        const key = `${pkg.packageId}@${pkg.version}`;
        const hash = createHash('sha256').update(key, 'utf8').digest('hex');
        ids.push(`imported-${hash.slice(0, 24)}`);
    }
    return { ids, source: `approved packages (${ids.length})` };
};
const real = loadRealIds();
console.log(`\n--- real article data (${real.source}) ---`);
check('real article data was available', real.ids.length > 0, `${real.ids.length} articles`);
// Every registered shelf must key off an id that genuinely exists.
const registeredIds = Object.keys(articleEnrichment_1.ARTICLE_ENRICHMENTS).filter((id) => (0, articleEnrichment_1.getArticleCuriosity)(id));
check('every registered shelf keys off a real article id', registeredIds.every((id) => real.ids.includes(id)), registeredIds.filter((id) => !real.ids.includes(id)).join(', ') || 'all present');
const realCards = real.ids.map((id) => cardFor(id));
const realMyth = realCards.filter((c) => (0, libraryBrowse_1.matchesLibraryFilters)(c, filtersWith({ curiosity: MYTHOLOGY })));
const realLing = realCards.filter((c) => (0, libraryBrowse_1.matchesLibraryFilters)(c, filtersWith({ curiosity: LINGUISTICS })));
const realGastr = realCards.filter((c) => (0, libraryBrowse_1.matchesLibraryFilters)(c, filtersWith({ curiosity: GASTRONOMY })));
const realUrban = realCards.filter((c) => (0, libraryBrowse_1.matchesLibraryFilters)(c, filtersWith({ curiosity: URBANISM })));
const realAll = realCards.filter((c) => (0, libraryBrowse_1.matchesLibraryFilters)(c, filtersWith({ curiosity: 'All' })));
check('Linguistics & Etymology -> 5 articles (real data)', realLing.length === 5, `got ${realLing.length}`);
check('Mythology, Folklore & Dark History -> 5 articles (real data)', realMyth.length === 5, `got ${realMyth.length}`);
check('Gastronomy & Food History -> at least 1 article (real data)', realGastr.length >= 1, `got ${realGastr.length}`);
check('Urbanism & Everyday Objects -> at least 1 article (real data)', realUrban.length >= 1, `got ${realUrban.length}`);
check('All -> every existing article (real data)', realAll.length === real.ids.length, `${realAll.length}/${real.ids.length}`);
/*
 * The Phase 4.9 batch, verified article by article: each id must exist in the
 * real data AND come back from the filter under the shelf its manifest gave it.
 * Together with the Mythology/Linguistics checks above, this satisfies the
 * rule that a new batch and a previously imported batch both appear on their
 * shelves.
 */
const NEW_BATCH_SHELVES = {
    'imported-0720a0c22c2e0cc59d04c919': GASTRONOMY, // dandelion
    'imported-9a88313ef92f1924330d8474': URBANISM, // The Blinkered Flaneur
    'imported-da1dd0d02aa2b239276a1493': URBANISM, // Typing for Love or Money
    'imported-3f3c0e01482d96fd29d2450b': URBANISM, // Cybernetic Attention
    'imported-78a6d5f186dfcfa470ae2483': URBANISM, // robot
};
check('every newly imported article exists in the real data', Object.keys(NEW_BATCH_SHELVES).every((id) => real.ids.includes(id)), Object.keys(NEW_BATCH_SHELVES).filter((id) => !real.ids.includes(id)).join(', ') || 'all present');
check('every newly imported article appears on its own shelf (real data)', Object.entries(NEW_BATCH_SHELVES).every(([id, shelf]) => realCards.some((card) => card.id === id && (0, libraryBrowse_1.matchesLibraryFilters)(card, filtersWith({ curiosity: shelf })))));
check('a previously imported article still appears on its shelf (real data)', realMyth.some((card) => card.id === 'imported-44ff5e66fa4a321ca3229c95'), 'The Mowing-Devil (1678)');
check('the four filled shelves are disjoint over real data', [...realMyth, ...realLing, ...realGastr, ...realUrban].every((card, index, all) => all.findIndex((other) => other.id === card.id) === index));
check('every real article without a registry entry is untagged', realCards.filter((c) => !c.curiosity).length
    === real.ids.length - registeredIds.filter((id) => real.ids.includes(id)).length, `${realCards.filter((c) => !c.curiosity).length} untagged of ${real.ids.length}`);
check('the two shelves are disjoint: no article is on both', underMyth.every((card) => !underLinguistics.some((other) => other.id === card.id)));
check('every article matching a shelf actually carries that shelf', [...underMyth, ...underLinguistics].every((card) => Boolean(card.curiosity)));
check('a shelf selection never leaks the other shelf\'s articles', underMyth.every((card) => card.curiosity === MYTHOLOGY)
    && underLinguistics.every((card) => card.curiosity === LINGUISTICS));
console.log(`\n${passed} assertions passed, ${failures.length} failed`);
if (failures.length > 0) {
    console.log('\nFAILURES:');
    for (const failure of failures)
        console.log(`  - ${failure}`);
    process.exit(1);
}
console.log('All curiosity filter tests passed.');
