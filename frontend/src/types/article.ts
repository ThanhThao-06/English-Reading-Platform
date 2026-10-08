export type Genre =
  | 'News & Social Issues'
  | 'Science & Nature'
  | 'Technology & AI'
  | 'Business & Economics'
  | 'Health & Psychology'
  | 'Culture, Art & Travel'
  | 'Stories & Literature'
  | 'Education'
  | 'History'
  | 'Environment'
  | 'Law & Politics';

export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export type ReadingTimeCategory = 'Under 3 min' | '5–10 min' | 'Chapter';

/**
 * The "Curiosities & Deep Dives" shelves.
 *
 * These are deliberately NOT genres and deliberately NOT a genre taxonomy:
 * `Genre` above is unchanged, no new genre was created, and an article that sits
 * in a curiosity shelf still keeps its own single `genre`. This is a second,
 * orthogonal browsing axis for subject matter that cuts across genres - an item
 * about a word's origin can be a Science & Nature piece, a Language & Etymology
 * curiosity, or both, and the two choices never compete for the same field.
 *
 * Because they are a separate axis, selecting one here never rewrites or clears
 * the Genre dropdown; the two simply narrow together.
 */
export type CuriosityTopic =
  | 'Philosophy & Thought Experiments'
  | 'Unsolved Mysteries & Fringe Science'
  | 'Linguistics & Etymology'
  | 'True Crime & Forensic Science'
  | 'Gastronomy & Food History'
  | 'Mythology, Folklore & Dark History'
  | 'Urbanism & Everyday Objects';


/**
 * A named section within an article.
 *
 * Chapters only *reference* the article's existing paragraphs via inclusive
 * indexes, so no paragraph text is ever duplicated. Indexes are global to the
 * article, never relative to the chapter, which is what keeps Highlights &
 * Notes (Phase 2.1) working unchanged.
 */
export interface ArticleChapter {
  id: string;
  title: string;
  /** Index of the first paragraph in this chapter (inclusive). */
  startParagraphIndex: number;
  /** Index of the last paragraph in this chapter (inclusive). */
  endParagraphIndex: number;
  /** Optional one-line description, only when it accurately reflects the text. */
  summary?: string;
}

export interface Article {
  id: string;
  title: string;
  description: string;
  image: string | null;
  genre: Genre;
  level: CEFRLevel;
  readingTime: ReadingTimeCategory;
  content: string;
  /**
   * Optional chapter metadata. Articles without chapters stay valid and are
   * rendered as one continuous document, exactly as before.
   */
  chapters?: ArticleChapter[];
  /** Full import audit context for articles loaded from the production API. */
  importMetadata?: ImportedArticleMetadata;
}

export interface ImportedArticleMetadata {
  packageId: string;
  packageVersion: number;
  sourceRecordId: string;
  contentHash: string;
  importedAt: string;
  importBatchId: string;
  libraryImportApproval: {
    approvalStatus: 'APPROVED_FOR_LIBRARY_IMPORT';
    packageId: string;
    packageVersion: number;
    packageSha256: string;
    approvedAt: string;
    approver: string;
    decision: string;
  };
  content: {
    language: string | null;
    contentType: string | null;
    contentGroup: string | null;
    categories: Record<string, unknown>;
    reuseMode: string;
  };
  authors: string[] | null;
  source: Record<string, unknown>;
  rights: Record<string, unknown>;
  provenance: Record<string, unknown>;
}

/**
 * The card fields the Library list, search and filters need.
 *
 * `curiosity` is ADDED HERE rather than on `Article` on purpose. It is an
 * editorial shelf assigned by the Library, not part of an article's stored
 * content, so it stays out of `Article` and out of the imported package shape.
 * `ArticleCardData` is the Library's own view model, which is exactly where a
 * cross-genre shelf belongs; `Article` itself is unchanged.
 */
export type ArticleCardData = Pick<
  Article,
  'id' | 'title' | 'description' | 'image' | 'genre' | 'level' | 'readingTime'
> & {
  /**
   * The "Curiosities & Deep Dives" shelf this article sits on, or `undefined`
   * when none has been assigned. An untagged article is a normal state, and an
   * untagged article matches no specific shelf.
   */
  curiosity?: CuriosityTopic;
};

export interface FilterState {
  searchQuery: string;
  genre: Genre | 'All';
  level: CEFRLevel | 'All';
  readingTime: ReadingTimeCategory | 'All';
  /**
   * The cross-genre curiosity shelf. Separate from `genre` on purpose, so the
   * two filters narrow together without either rewriting the other.
   */
  curiosity: CuriosityTopic | 'All';
}
/* ==========================================================================
   Phase 3.1 - Article metadata foundation
   --------------------------------------------------------------------------
   Everything below is ADDITIVE. `Article`, `ArticleChapter`, `Genre`,
   `CEFRLevel`, `ReadingTimeCategory` and `FilterState` above are unchanged, so
   every existing article object, every existing test and every existing
   consumer keeps compiling and behaving exactly as before.

   Two deliberate rules govern this section:

   1. No field here duplicates an existing `Article` field. There is no
      `cefrLevel` next to `level`, no `coverImage` next to `image`, and no stored
      `wordCount` / `paragraphCount` / `searchText`, because all of those are
      either already present or can be derived in `utils/articleSelectors.ts`.

   2. Nothing below is required. An article without any of this metadata is
      still a perfectly valid article, which is what keeps the current library
      working with no migration at all.
   ========================================================================== */

/**
 * What KIND of text this is - the form of the content, independent of subject
 * matter.
 *
 * This is deliberately separate from `Genre`, which is legacy and must not be
 * reinterpreted: `Science` says something about the topic, while `news` /
 * `short-story` / `novel` say something about the form. Those two axes are
 * orthogonal, and one field cannot carry both.
 *
 * Extend this union when new genuinely different forms appear. Existing values
 * must never be renamed or removed.
 */
export type ContentType =
  | 'news'
  | 'editorial'
  | 'educational'
  | 'expository'
  | 'short-story'
  | 'novel'
  | 'classic-literature'
  | 'poetry'
  | 'dialogue'
  | 'other';

/**
 * Top-level navigation groups for the library.
 *
 * These are CONTENT groups, not country categories. Every article from every
 * country belongs to the same `articles` group; where a piece comes from is
 * recorded separately in `ArticleSource.publisherCountryCode`, and what it is
 * about in `ArticleEnrichment.countriesAbout`. A country is never a group.
 *
 * The six values are deliberately coarse and stable. They describe where a
 * reader goes to find something, not what the thing is about:
 *
 * - `articles` - news plus newspaper and magazine articles, from any country.
 * - `encyclopedia` - encyclopedia entries and general knowledge.
 * - `specialized` - professional and subject-specific educational reading.
 * - `short-story` - short stories.
 * - `novel` - novels and longer fiction.
 * - `classic-literature` - classic literary works.
 *
 * This is deliberately independent of `ContentType`: a newspaper editorial
 * lives in the unified `articles` group while its content type stays
 * `editorial`. Existing values must never be renamed or removed.
 */
export type ContentGroup =
  | 'articles'
  | 'encyclopedia'
  | 'specialized'
  | 'short-story'
  | 'novel'
  | 'classic-literature';

/**
 * How wide the geographic focus of a piece is.
 *
 * This is the honest home for "worldwide" or "not about any one place". It
 * exists so that a global article never has to be given a fake country code
 * such as `XX` or `ZZ` just to satisfy a filter.
 *
 * An absent value means "geographic scope not recorded", which is not the same
 * as any particular member of this union.
 */
export type GeographicScope =
  | 'national'
  | 'regional'
  | 'international'
  | 'global'
  | 'none';

/**
 * Subject matter of an article.
 *
 * The initial vocabulary is an open starting point, not a closed set: adding a
 * member is a safe, additive change. `Genre` is intentionally left untouched,
 * because renaming, reordering or removing its members would break the existing
 * `FilterBar` options and the existing data.
 */
export type Category =
  | 'science'
  | 'technology'
  | 'business'
  | 'finance'
  | 'healthcare'
  | 'history'
  | 'culture'
  | 'environment'
  | 'education'
  | 'psychology'
  | 'travel'
  | 'sports'
  | 'society'
  | 'politics'
  | 'literature'
  | 'language-learning'
  | 'food'
  | 'art'
  | 'career'
  | 'other';

/**
 * Coarse parent groups, so a future UI could offer "Science & Technology" as a
 * single filter instead of listing every category separately.
 *
 * This is a taxonomy grouping only. It carries no legal, editorial or
 * difficulty meaning and does not change how any article is categorised.
 */
export type CategoryGroup =
  | 'science-technology'
  | 'business-finance'
  | 'health-lifestyle'
  | 'history-culture'
  | 'society-education'
  | 'arts-literature'
  | 'other';
/**
 * The basis on which an article's text may be reused.
 *
 * These labels record how reuse was established, and they are deliberately
 * cautious:
 *
 * - `public-domain` - only when public-domain status was actually verified.
 *   Publication year alone is never treated as proof here.
 * - `creative-commons` - only together with the specific licence recorded in
 *   `ArticleLicense`. CC licences differ from one another, so this label by
 *   itself says nothing about the terms.
 * - `permitted-reuse` - explicit permission from the rights holder, recorded in
 *   `permissionEvidence`.
 * - `link-only` - free to read at the source, but the text must NOT be copied
 *   into this app. This is a deliberate "read, do not reproduce" state.
 * - `unknown` - reuse rights are not established. Full text must NOT be
 *   imported on the assumption that it is fine.
 *
 * Being able to read something on a website is never evidence that copying it
 * is permitted, and no value here grants or denies permission on its own: the
 * specific terms live in `ArticleLicense`.
 */
export type LicenseType =
  | 'public-domain'
  | 'creative-commons'
  | 'permitted-reuse'
  | 'link-only'
  | 'unknown';

/**
 * Where an article came from.
 *
 * Every field except `name` is optional, because provenance is often only
 * partially known, and a partial record is still more useful than none. Never
 * fill these in from guesswork: an unverified URL, author or date is worse than
 * a missing one.
 */
export interface ArticleSource {
  /** Website, publisher or organisation the text came from. */
  name: string;
  /** Direct URL of the specific article, when verified. */
  url?: string;
  /** Publishing house or organisation, when it differs from `name`. */
  publisher?: string;
  /**
   * ISO 3166-1 alpha-2 code for the country the PUBLISHER is based in.
   *
   * This describes the publisher's location and says nothing about the article's
   * subject. For "what the article is about", use
   * `ArticleEnrichment.countriesAbout`. An article published in the UK about
   * Vietnam has `publisherCountryCode: 'GB'` and `countriesAbout: ['VN']`, and
   * the two must never be collapsed into a single field.
   */
  publisherCountryCode?: string;
  /** Author, only when actually verified. */
  author?: string;
  /** ISO 8601 publication date, e.g. '2026-03-14' or a full timestamp. */
  publishedAt?: string;
  /** ISO 8601 date the content was retrieved. */
  retrievedAt?: string;
}

/**
 * The reuse terms recorded for one article.
 *
 * `type` is required because it states the basis. Everything else is optional
 * because each term may only be asserted once it has been verified: an absent
 * `attributionRequired`, `commercialUse` or `shareAlike` means "not
 * established", never "false".
 */
export interface ArticleLicense {
  /** Basis on which reuse is claimed. See `LicenseType`. */
  type: LicenseType;
  /** Exact licence name or identifier, e.g. 'CC BY-SA 4.0'. */
  id?: string;
  /** URL of the licence text or terms of use. */
  url?: string;
  /** Licence version, e.g. '4.0'. */
  version?: string;
  /** Whether visible attribution is required - only set once verified. */
  attributionRequired?: boolean;
  /** Attribution line to display, when the licence requires one. */
  attributionText?: string;
  /** Commercial use status - only set once the specific terms were checked. */
  commercialUse?: boolean;
  /** Whether share-alike terms apply. */
  shareAlike?: boolean;
  /**
   * Whether translating or otherwise deriving a new work is permitted.
   *
   * Absent means "not established" - never "yes" and never "no". Being able to
   * read a text, or to reach it through a free API or an RSS feed, says nothing
   * about this, so it must never be filled in by inference.
   */
  translationAllowed?: boolean;
  /**
   * Whether the full text may be republished inside this app.
   *
   * Absent means "not established". For anything merely free to read upstream
   * this must stay unset or `false`.
   */
  republishingAllowed?: boolean;
  /** Note or link to the evidence supporting the reuse claim. */
  permissionEvidence?: string;
  /** ISO 8601 date the licence terms were verified. */
  verifiedAt?: string;
}

/**
 * A longer work split into parts.
 *
 * Only for articles that genuinely belong to a series or multi-part work. A
 * standalone story with numbered sections inside it is not a series.
 */
export interface ArticleSeries {
  /** Title of the overall work. */
  title: string;
  /** Position of this article within the work. */
  partNumber?: number;
  /** Total number of parts, when known. */
  totalParts?: number;
}

/**
 * Optional metadata that sits alongside an `Article` without being stored
 * inside it.
 *
 * This exists so the library can grow into news, licensed literature and
 * multi-chapter novels without rewriting `articles.ts`. Every field is
 * optional by design: an article with no enrichment is still valid, which is
 * exactly how all ten current articles are treated today.
 *
 * Nothing here duplicates an existing `Article` field on purpose. There is no
 * CEFR level (use `Article.level`), no cover image (use `Article.image`), no
 * reading time (use `Article.readingTime`), and no stored word or paragraph
 * counts, because those are derived in `utils/articleSelectors.ts`.
 */
export interface ArticleEnrichment {
  /**
   * Which top-level library section this item is filed under. See `ContentGroup`.
   *
   * Optional and deliberately unset for the ten existing articles: a group is
   * an editorial judgement, and for several of them more than one group would
   * be defensible. Unset means "not classified yet", which is supported.
   */
  contentGroup?: ContentGroup;
  /** Form of the content, independent of subject. */
  contentType?: ContentType;
  /**
   * The one topic that best describes the item, when a single one can be named.
   *
   * At most one, and never duplicated in `secondaryCategories`. Prefer this
   * over the legacy `categories` array. Absent simply means no single dominant
   * topic, which is a normal state rather than a gap.
   */
  primaryCategory?: Category;
  /**
   * Every further topic the item genuinely covers. Zero or more.
   *
   * Always read through `normalizeSecondaryCategories` in
   * `utils/metadataValidation.ts`, which discards duplicates, discards the
   * primary category and discards values outside `Category`, so a careless list
   * can never leak a repeated or invalid topic into a filter.
   */
  secondaryCategories?: Category[];
  /**
   * The "Curiosities & Deep Dives" shelf for this article, when exactly one
   * applies.
   *
   * Deliberately NOT a `Category` and deliberately not a `Genre`: the shelves are
   * a separate, cross-cutting axis, so an article keeps its own genre and this
   * tag narrows alongside it without ever competing for the same field. Absent
   * simply means "not filed on a shelf", which is a normal state.
   */
  curiosity?: CuriosityTopic;
  /**
   * LEGACY undifferentiated topic list, kept so that the existing registry
   * entries and any other consumer of `categories` keep working untouched.
   *
   * Prefer `primaryCategory` / `secondaryCategories` for new data. Both shapes
   * may coexist: the selectors bridge them, treating the explicit fields as
   * authoritative and folding in any legacy entries as additional secondary
   * topics, so nothing already recorded is lost or reinterpreted.
   */
  categories?: Category[];
  /**
   * Countries or territories the CONTENT is about, ISO 3166-1 alpha-2.
   *
   * This is not the publisher's country - that is
   * `ArticleSource.publisherCountryCode`. Fill it only when the text genuinely
   * concerns those places. An empty or absent list means "no specific
   * geographic focus", which is a perfectly valid answer.
   */
  countriesAbout?: string[];
  /**
   * How wide the geographic focus is, when that is worth recording.
   *
   * This exists so "worldwide" or "not about any one place" can be said
   * honestly. It must never be encoded as a stand-in country code: `XX`, `ZZ`
   * and similar are rejected by `isCountryCode`.
   */
  geographicScope?: GeographicScope;
  /** Language of the text, ISO 639-1 where possible, e.g. 'en', 'vi'. */
  language?: string;
  /** Only when this article is a part of a longer work. */
  series?: ArticleSeries;
  /** Provenance, once verified. */
  source?: ArticleSource;
  /** Reuse terms, once verified. */
  license?: ArticleLicense;
}

/**
 * An `Article` together with its optional enrichment.
 *
 * A read-only view model used by the selectors. It adds a single optional
 * `enrichment` field and never shadows or redefines any `Article` field, so a
 * plain `Article` is assignable to it unchanged and stored data is unaffected.
 */
export interface LibraryArticle extends Article {
  enrichment?: ArticleEnrichment;
}
