/**
 * The NOAA National Ocean Service articles selected for this batch.
 *
 * Fields: [slug, canonicalUrl, genre, level, contentType, primaryCategory,
 *          secondaryCategories, whyThisGenre]
 *
 * Selection is 10 items spanning 8 distinct Library genres and 4 reading levels
 * (A2/B1/B2/C1), per the batch cap of up to 10 diverse articles.
 *
 * `genre` and `level` are Library editorial mappings recorded during the audit,
 * not publisher-claimed labels. Reading time is NOT listed here: it is derived
 * from the extracted word count at 200 WPM by the builder.
 *
 * Every URL is on the official oceanservice.noaa.gov host. Each item is still
 * re-verified at build time: rights markers, author credit, body quality and
 * duplicates are all re-checked, and an item that fails is SKIPped or REJECTed
 * rather than force-fitted.
 *
 * AUDITED BUT NOT SELECTED (verified eligible, held back only to respect the
 * 10-item cap; recorded in reports/selection.md):
 *   tigershrimp     Environment, B2
 *   nutpollution    Environment, B1
 *   barrier-islands Environment, B2
 *   bathymetry      Technology & AI, B1
 */
export const ARTICLES = [
  ['seafoam', 'https://oceanservice.noaa.gov/facts/seafoam.html',
    'Science & Nature', 'A2', 'expository', 'science', ['environment'],
    'Short, plain-language explainer on what sea foam is and how it forms.'],
  ['oceaneconomy', 'https://oceanservice.noaa.gov/facts/oceaneconomy.html',
    'Business & Economics', 'B1', 'expository', 'business', ['finance', 'society'],
    'Explains the ocean economy: jobs, goods and services derived from marine and coastal resources.'],
  ['lighthouse', 'https://oceanservice.noaa.gov/facts/lighthouse.html',
    'Culture, Art & Travel', 'B1', 'expository', 'travel', ['history', 'culture'],
    'Human-interest piece on lighthouses as coastal landmarks and visitor destinations.'],
  ['marheritage', 'https://oceanservice.noaa.gov/facts/marheritage.html',
    'History', 'B1', 'expository', 'history', ['culture'],
    'Introduces the maritime heritage program and the history it protects.'],
  ['ocean-gliders', 'https://oceanservice.noaa.gov/facts/ocean-gliders.html',
    'Technology & AI', 'B2', 'expository', 'technology', ['science'],
    'Describes autonomous ocean glider instrumentation used in ocean observation.'],
  ['lawofsea', 'https://oceanservice.noaa.gov/facts/lawofsea.html',
    'Law & Politics', 'B2', 'expository', 'politics', ['society'],
    'Explainer on the international law of the sea and which body administers it.'],
  ['coral_medicine', 'https://oceanservice.noaa.gov/facts/coral_medicine.html',
    'Health & Psychology', 'B2', 'expository', 'healthcare', ['science'],
    'Surveys marine organisms as sources of potential medicines; subject is human health.'],
  ['greenland-shark', 'https://oceanservice.noaa.gov/facts/greenland-shark.html',
    'Science & Nature', 'B2', 'expository', 'science', ['environment'],
    'Species explainer on Greenland shark longevity; subject is marine biology.'],
  ['coral_bleach', 'https://oceanservice.noaa.gov/facts/coral_bleach.html',
    'Environment', 'B2', 'expository', 'environment', ['science'],
    'Reports coral bleaching causes and documented bleaching events; subject is environmental change.'],
  ['amoc', 'https://oceanservice.noaa.gov/facts/amoc.html',
    'Science & Nature', 'C1', 'expository', 'science', ['environment', 'society'],
    'Technical explainer on the Atlantic Meridional Overturning Circulation and its measurement.'],
];

