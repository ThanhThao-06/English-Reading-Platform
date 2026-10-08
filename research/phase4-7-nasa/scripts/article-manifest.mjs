/**
 * The NASA articles selected for this batch.
 *
 * Fields: [slug, canonicalUrl, genre, level, contentType, primaryCategory,
 *          secondaryCategories, whyThisGenre]
 *
 * Selection is 10 items spanning 4 distinct Library genres and 4 reading levels
 * (A2/B1/B2/C1), matching the established batch cap of up to 10 articles.
 *
 * `genre` and `level` are Library editorial mappings recorded during the audit,
 * not publisher-claimed labels. Reading time is NOT listed here: it is derived
 * from the extracted word count at 200 WPM by the builder.
 *
 * Every URL is on an official NASA host. Each item is re-verified at build time:
 * third-party markers, partner credit lines, NASA provenance, citation date,
 * body quality, index-page shape and duplicates are all re-checked, and an item
 * that fails is SKIPped or REJECTed rather than force-fitted.
 *
 * AUDITED AND SKIPPED (real findings, documented in the batch report):
 *   science.nasa.gov/technology/       topic hub, 18 links / 26 blocks
 *   science.nasa.gov/aeronautics/       topic hub, 11 links / 14 blocks
 *   www.nasa.gov/history/               topic hub, 53 links / 84 blocks
 *   science.nasa.gov/humans-in-space/   no readable "Page Last Updated" date
 *   science.nasa.gov/learning-resources/ no readable "Page Last Updated" date
 */
export const ARTICLES = [
  ['saturn', 'https://science.nasa.gov/saturn/',
    'Science & Nature', 'A2', 'expository', 'science', [],
    'Short, plain-language guide to the planet Saturn: size, rings and moons.'],
  ['black-holes', 'https://science.nasa.gov/universe/black-holes/',
    'Science & Nature', 'B1', 'expository', 'science', ['technology'],
    'Explainer on what black holes are, how they are detected and what they are not.'],
  ['sun', 'https://science.nasa.gov/sun/',
    'Science & Nature', 'B1', 'expository', 'science', ['environment'],
    'Explainer on the Sun and how scientists study it from space.'],
  ['moon', 'https://science.nasa.gov/moon/',
    'Science & Nature', 'B2', 'expository', 'science', ['history'],
    'Overview of Earth\u2019s Moon: formation, surface, motion and exploration.'],
  ['exoplanets', 'https://science.nasa.gov/exoplanets/',
    'Science & Nature', 'B2', 'expository', 'science', ['technology'],
    'Explains how planets outside our solar system are detected and studied.'],
  ['dark-matter', 'https://science.nasa.gov/dark-matter/',
    'Science & Nature', 'C1', 'expository', 'science', ['technology'],
    'Technical explainer on dark matter, its evidence and how it is mapped.'],
  ['earth-science', 'https://science.nasa.gov/earth-science/',
    'Environment', 'B2', 'expository', 'environment', ['science'],
    'Describes NASA Earth Science: satellites and research programs observing the planet.'],
  ['climate-change', 'https://science.nasa.gov/climate-change/',
    'Environment', 'B2', 'expository', 'environment', ['science'],
    'States NASA\u2019s role in collecting long-term observations of a changing planet.'],
  ['skywatching', 'https://science.nasa.gov/skywatching/',
    'Culture, Art & Travel', 'B1', 'expository', 'travel', ['science', 'education'],
    'Practical amateur skywatching guidance: what to observe, when and how.'],
  ['machine-learning', 'https://science.nasa.gov/science-research/science-enabling-technology/nasa-uses-machine-learning-to-enhance-flash-flood-warnings/',
    'Technology & AI', 'B2', 'expository', 'technology', ['environment', 'science'],
    'Describes how NASA applies machine learning to improve flash-flood warnings.'],
];
