import {
  DEFAULT_SESSION_LIMIT,
  INITIAL_EASE_FACTOR,
  MAX_EASE_FACTOR,
  MAX_INTERVAL_DAYS,
  MAX_REQUEUES_PER_SESSION,
  MIN_EASE_FACTOR,
  MIN_INTERVAL_DAYS,
  applyReview,
  createInitialProgress,
  formatInterval,
  isDue,
} from '../src/utils/srs';
import {
  buildDueCards,
  clearFlashcardProgress,
  countDueCards,
  getAllFlashcards,
  getFlashcard,
  pruneOrphanFlashcards,
  removeFlashcardProgress,
  saveFlashcardProgress,
} from '../src/utils/flashcardStorage';
import type { FlashcardProgress, ReviewRating } from '../src/types/flashcard';
import type { VocabularyWord } from '../src/types/vocabulary';

/**
 * Compiled standalone (outside the app's tsconfig) to run under plain Node, so
 * the usual DOM/Node globals are declared here rather than pulling in extra type
 * packages just for a test run.
 */
declare const console: { log: (...args: unknown[]) => void };
declare const process: { exit: (code: number) => void };

let passed = 0;
const failures: string[] = [];

const check = (name: string, condition: boolean, detail = '') => {
  if (condition) {
    passed += 1;
  } else {
    failures.push(`${name}${detail ? ` -> ${detail}` : ''}`);
  }
};

const eq = (name: string, actual: unknown, expected: unknown) => {
  check(
    name,
    JSON.stringify(actual) === JSON.stringify(expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
};

/* Minimal in-memory localStorage, so storage behaviour is genuinely exercised. */
class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  clear() {
    this.data.clear();
  }
}

const store = new MemoryStorage();
(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = store;

const VOCAB_KEY = 'english-reading-vocabulary';
const SRS_KEY = 'english-reading-flashcards';

/** A fixed clock, so every scheduling assertion is deterministic. */
const NOW = new Date('2026-01-15T10:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const makeWord = (id: string, word: string): VocabularyWord => ({
  id,
  word,
  meaning: `meaning of ${word}`,
  meaningVi: `nghÄ©a cá»§a ${word}`,
  example: `An example with ${word}.`,
  sourceArticleId: 'art-005',
  sourceArticleTitle: 'Test Article',
  status: 'learning',
  savedAt: NOW.toISOString(),
});

const setVocabulary = (words: VocabularyWord[]) => {
  store.setItem(VOCAB_KEY, JSON.stringify(words));
};

const reset = () => {
  store.clear();
};



/** Existing state with `interval` days of schedule already applied. */
const scheduledState = (
  vocabularyId: string,
  repetitions: number,
  interval: number,
  easeFactor: number
): FlashcardProgress => ({
  vocabularyId,
  repetitions,
  interval,
  easeFactor,
  dueAt: new Date(NOW.getTime() + interval * DAY).toISOString(),
});
/* ==========================================================================
   New card
   ========================================================================== */

const fresh = createInitialProgress('vocab-001', NOW);
eq('new card: repetitions', fresh.repetitions, 0);
eq('new card: interval', fresh.interval, 0);
eq('new card: easeFactor', fresh.easeFactor, INITIAL_EASE_FACTOR);
eq('new card: due immediately', fresh.dueAt, NOW.toISOString());
check('new card: is due now', isDue(fresh, NOW));

/* ==========================================================================
   Again
   ========================================================================== */

const againNew = applyReview('vocab-001', 'again', null, NOW);
eq('again (new): repetitions reset', againNew.repetitions, 0);
eq('again (new): interval reset', againNew.interval, 0);
check(
  'again (new): due very soon',
  Date.parse(againNew.dueAt) > NOW.getTime() && Date.parse(againNew.dueAt) - NOW.getTime() < DAY
);
eq('again (new): rating recorded', againNew.lastRating, 'again');
eq('again (new): reviewed timestamp', againNew.lastReviewedAt, NOW.toISOString());

const againLearned = applyReview('vocab-001', 'again', scheduledState('vocab-001', 5, 30, 2.5), NOW);
eq('again (learned): repetitions reset to 0', againLearned.repetitions, 0);
eq('again (learned): interval reset to 0', againLearned.interval, 0);
check('again (learned): easeFactor lowered', againLearned.easeFactor < 2.5);

/* ==========================================================================
   Hard
   ========================================================================== */

const hardNew = applyReview('vocab-001', 'hard', null, NOW);
eq('hard (new): interval is 1 day', hardNew.interval, 1);
eq('hard (new): easeFactor lowered', hardNew.easeFactor, INITIAL_EASE_FACTOR - 0.15);
check('hard (new): repetitions incremented', hardNew.repetitions > 0);

const hardExisting = applyReview('vocab-001', 'hard', scheduledState('vocab-001', 2, 10, 2.5), NOW);
eq('hard (existing): interval grows by ~1.2x', hardExisting.interval, 12);
eq('hard (existing): easeFactor penalty', hardExisting.easeFactor, 2.35);

const hardSmall = applyReview('vocab-001', 'hard', scheduledState('vocab-001', 1, 1, 2.5), NOW);
check('hard (existing): interval never drops below 1 day', hardSmall.interval >= MIN_INTERVAL_DAYS);

/* ==========================================================================
   Good
   ========================================================================== */

const goodNew = applyReview('vocab-001', 'good', null, NOW);
eq('good (new): interval is 1 day', goodNew.interval, 1);
eq('good (new): repetitions', goodNew.repetitions, 1);
eq('good (new): easeFactor bonus', goodNew.easeFactor, INITIAL_EASE_FACTOR + 0.05);

const goodExisting = applyReview('vocab-001', 'good', scheduledState('vocab-001', 3, 10, 2.5), NOW);
eq('good (existing): interval grows by easeFactor', goodExisting.interval, 25);
eq('good (existing): repetitions increment', goodExisting.repetitions, 4);
eq('good (existing): easeFactor bonus', goodExisting.easeFactor, 2.55);

/* ==========================================================================
   Easy
   ========================================================================== */

const easyNew = applyReview('vocab-001', 'easy', null, NOW);
check('easy (new): interval longer than 1 day', easyNew.interval > goodNew.interval);
eq('easy (new): easeFactor bonus is larger', easyNew.easeFactor, INITIAL_EASE_FACTOR + 0.15);

const easyExisting = applyReview('vocab-001', 'easy', scheduledState('vocab-001', 3, 10, 2.5), NOW);
eq('easy (existing): interval = interval * ease * 1.3', easyExisting.interval, 33);
check(
  'easy: grows faster than Good',
  easyExisting.interval > applyReview('vocab-001', 'good', scheduledState('vocab-001', 3, 10, 2.5), NOW).interval
);
check(
  'easy: grows faster than Hard',
  easyExisting.interval > applyReview('vocab-001', 'hard', scheduledState('vocab-001', 3, 10, 2.5), NOW).interval
);

/* ==========================================================================
   Limits: ease factor and interval are clamped
   ========================================================================== */

let low = scheduledState('vocab-001', 10, 100, MIN_EASE_FACTOR);
for (let i = 0; i < 6; i += 1) low = applyReview('vocab-001', 'hard', low, NOW);
eq('limit: easeFactor never falls below the minimum', low.easeFactor, MIN_EASE_FACTOR);

let high = scheduledState('vocab-001', 10, 100, MAX_EASE_FACTOR);
for (let i = 0; i < 6; i += 1) high = applyReview('vocab-001', 'easy', high, NOW);
eq('limit: easeFactor never exceeds the maximum', high.easeFactor, MAX_EASE_FACTOR);

const capped = applyReview('vocab-001', 'easy', scheduledState('vocab-001', 30, 360, 2.5), NOW);
eq('limit: interval capped at the maximum', capped.interval, MAX_INTERVAL_DAYS);

const cappedGood = applyReview('vocab-001', 'good', scheduledState('vocab-001', 30, 300, 2.9), NOW);
check('limit: interval capped for Good too', cappedGood.interval === MAX_INTERVAL_DAYS);

for (const rating of ['again', 'hard', 'good', 'easy'] as ReviewRating[]) {
  const result = applyReview('vocab-001', rating, scheduledState('vocab-001', 2, 5, 2.5), NOW);
  check(
    `limit: ${rating} keeps interval in range`,
    result.interval >= 0 && result.interval <= MAX_INTERVAL_DAYS,
    `interval=${result.interval}`
  );
  check(
    `limit: ${rating} keeps ease in range`,
    result.easeFactor >= MIN_EASE_FACTOR && result.easeFactor <= MAX_EASE_FACTOR
  );
}

/* ==========================================================================
   Due date
   ========================================================================== */

const scheduled = applyReview('vocab-001', 'good', scheduledState('vocab-001', 1, 2, 2.5), NOW);
eq('due date: interval 2 * 2.5 = 5 days', scheduled.interval, 5);
eq(
  'due date: dueAt is exactly interval days later',
  scheduled.dueAt,
  new Date(NOW.getTime() + 5 * DAY).toISOString()
);
check('due date: not due before its time', !isDue(scheduled, NOW));
check('due date: due once the time arrives', isDue(scheduled, new Date(NOW.getTime() + 5 * DAY + 1)));

const dayLater = applyReview('vocab-001', 'good', null, NOW);
eq('due date: interval 1 day = 24h', Date.parse(dayLater.dueAt) - NOW.getTime(), DAY);

/* ==========================================================================
   Storage
   ========================================================================== */

reset();
eq('storage: empty when nothing saved', getAllFlashcards(), {});
check('storage: unknown id returns null', getFlashcard('nope') === null);

check('storage: save returns progress', saveFlashcardProgress('vocab-001', 'good', NOW) !== null);
eq('storage: keyed by vocabularyId', getFlashcard('vocab-001')?.interval, 1);
check('storage: stored under the SRS key', store.getItem(SRS_KEY) !== null);
check(
  'storage: vocabulary key untouched',
  store.getItem(VOCAB_KEY) === null,
  'flashcards must never write to english-reading-vocabulary'
);

saveFlashcardProgress('vocab-001', 'good', new Date(NOW.getTime() + DAY));
eq('storage: updated in place', getFlashcard('vocab-001')?.interval, 3);
eq('storage: only one entry stored', Object.keys(getAllFlashcards()).length, 1);

store.setItem(SRS_KEY, '{not valid json');
eq('storage: corrupt JSON yields empty map', getAllFlashcards(), {});

store.setItem(SRS_KEY, JSON.stringify({ 'vocab-001': { nonsense: true } }));
eq('storage: invalid entries are dropped', getAllFlashcards(), {});

store.setItem(SRS_KEY, JSON.stringify(['array', 'not', 'a', 'map']));
eq('storage: array payload yields empty map', getAllFlashcards(), {});

store.setItem(
  SRS_KEY,
  JSON.stringify({
    'vocab-001': {
      vocabularyId: 'vocab-001',
      repetitions: 2,
      interval: 99999,
      easeFactor: 99,
      dueAt: '2026-01-15T10:00:00.000Z',
    },
  })
);
eq('storage: interval normalised', getFlashcard('vocab-001')?.interval, MAX_INTERVAL_DAYS);
eq('storage: easeFactor normalised', getFlashcard('vocab-001')?.easeFactor, MAX_EASE_FACTOR);

check('storage: remove returns true', removeFlashcardProgress('vocab-001'));
check('storage: removed card is gone', getFlashcard('vocab-001') === null);
check('storage: removing a missing card returns false', !removeFlashcardProgress('vocab-001'));


/* ==========================================================================
   Vocabulary relationship: no duplication, no orphans
   ========================================================================== */

reset();
const words = [makeWord('vocab-001', 'sustainable'), makeWord('vocab-002', 'resilience')];
setVocabulary(words);

eq('vocab: no SRS data before any review', JSON.parse(store.getItem(SRS_KEY) ?? '{}') && Object.keys(JSON.parse(store.getItem(SRS_KEY) ?? '{}')).length, 0);

const dueBefore = buildDueCards(NOW);
eq('vocab: new words are immediately due', dueBefore.length, 2);
check(
  'vocab: card carries the original vocabulary content',
  dueBefore[0].word.word === 'sustainable' && dueBefore[0].word.meaning === 'meaning of sustainable'
);
check('vocab: new card starts with no history', dueBefore[0].progress?.repetitions === 0);

// After a review, only scheduling data is stored - never the word content.
saveFlashcardProgress('vocab-001', 'good', NOW);
const storedEntry = JSON.parse(store.getItem(SRS_KEY) as string)['vocab-001'];
eq('vocab: SRS stores only the reference', storedEntry.vocabularyId, 'vocab-001');
for (const field of ['word', 'meaning', 'example', 'audioUrl', 'phonetic']) {
  check(`vocab: SRS does not duplicate "${field}"`, !(field in storedEntry));
}
eq('vocab: personal vocabulary still intact', JSON.parse(store.getItem(VOCAB_KEY) as string).length, 2);

const dueAfterGood = buildDueCards(NOW);
eq('vocab: reviewed card leaves the queue', dueAfterGood.length, 1);
check('vocab: the unreviewed word remains', dueAfterGood[0].word.id === 'vocab-002');

// Deleting the vocabulary word removes it from review, leaving no orphan card.
setVocabulary([words[1]]);
const dueAfterDelete = buildDueCards(NOW);
eq('vocab: deleted word is not reviewed', dueAfterDelete.length, 1);
check('vocab: surviving word is the one shown', dueAfterDelete[0].word.id === 'vocab-002');
eq('vocab: prune removes the orphan schedule', pruneOrphanFlashcards(), 1);
eq('vocab: orphan schedule is gone', getFlashcard('vocab-001'), null);

// Restoring the word does not resurrect the deleted schedule.
setVocabulary(words);
eq('vocab: restored word is new again', getFlashcard('vocab-001'), null);

/* ==========================================================================
   Ordering and session limit
   ========================================================================== */

reset();
setVocabulary([makeWord('a', 'alpha'), makeWord('b', 'beta'), makeWord('c', 'gamma')]);

// a: long overdue, b: slightly overdue, c: scheduled for the future.
store.setItem(
  SRS_KEY,
  JSON.stringify({
    a: { ...scheduledState('a', 1, 1, 2.5), dueAt: new Date(NOW.getTime() - 10 * DAY).toISOString() },
    b: { ...scheduledState('b', 1, 1, 2.5), dueAt: new Date(NOW.getTime() - 1 * DAY).toISOString() },
    c: { ...scheduledState('c', 1, 30, 2.5), dueAt: new Date(NOW.getTime() + 30 * DAY).toISOString() },
  })
);

const ordered = buildDueCards(NOW);
eq('order: excludes cards that are not due yet', ordered.length, 2);
eq('order: most overdue first', ordered[0].word.id, 'a');
eq('order: then next most overdue', ordered[1].word.id, 'b');

reset();
setVocabulary([makeWord('a', 'alpha'), makeWord('b', 'beta'), makeWord('c', 'gamma')]);
store.setItem(
  SRS_KEY,
  JSON.stringify({
    a: { ...scheduledState('a', 1, 1, 2.5), dueAt: new Date(NOW.getTime() - 5 * DAY).toISOString() },
    c: { ...scheduledState('c', 1, 30, 2.5), dueAt: new Date(NOW.getTime() + 30 * DAY).toISOString() },
  })
);
const withNew = buildDueCards(NOW);
eq('order: scheduled due cards come before new cards', withNew[0].word.id, 'a');
eq('order: new card is included', withNew.length, 2);
check('order: the new card has no repetitions', withNew[1].progress?.repetitions === 0);

reset();
const many = Array.from({ length: 50 }, (_, i) => makeWord(`w-${i}`, `word${i}`));
setVocabulary(many);
eq('session: default limit is 20', DEFAULT_SESSION_LIMIT, 20);
eq('session: queue is capped at the limit', buildDueCards(NOW).length, DEFAULT_SESSION_LIMIT);
eq('session: uncapped count sees all 50', countDueCards(NOW), 50);
eq('session: custom limit respected', buildDueCards(NOW, 5).length, 5);
eq('session: capping does not delete or save anything', getAllFlashcards(), {});
eq('session: remaining cards stay due', countDueCards(NOW), 50);

check(
  'session: requeue budget is small and finite',
  MAX_REQUEUES_PER_SESSION > 0 && MAX_REQUEUES_PER_SESSION <= 3
);

/* ==========================================================================
   Formatting helper
   ========================================================================== */

eq('format: 0 days', formatInterval(0), 'now');
eq('format: 1 day', formatInterval(1), '1 day');
eq('format: 3 days', formatInterval(3), '3 days');
eq('format: 30 days', formatInterval(30), '1 month');
eq('format: 365 days', formatInterval(365), '1 year');

/* ==========================================================================
   Report
   ========================================================================== */

console.log(`\n${passed} assertions passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('All SRS tests passed.');
reset();
saveFlashcardProgress('vocab-001', 'good', NOW);
clearFlashcardProgress();
eq('storage: clear removes everything', getAllFlashcards(), {});

check(
  'storage: invalid rating is rejected',
  saveFlashcardProgress('vocab-001', 'nope' as ReviewRating, NOW) === null
);
