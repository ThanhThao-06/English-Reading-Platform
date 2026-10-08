/**
 * The 12 audited VOA Learning English articles to import.
 *
 * Fields: [id, canonicalUrl, genre, level, contentType, primaryCategory,
 *          secondaryCategories, whyThisGenre]
 *
 * `genre` and `level` are Library editorial mappings recorded during the audit,
 * not publisher-claimed labels. Reading time is NOT listed here: it is derived
 * from the extracted word count at 200 WPM by the builder.
 *
 * DELIBERATELY ABSENT: `128165` "The Information Age: The Internet". Its page
 * carries no VOA-named producer credit, so the conditional full-text grant
 * would refuse it. It is excluded rather than force-fitted, and the rights gate
 * is not relaxed anywhere to accommodate it.
 */
export const ARTICLES = [
  ['3303557', 'https://learningenglish.voanews.com/a/3303557.html',
    'Education', 'B1', 'educational', 'education', ['language-learning'],
    'Education Tips explainer from a named university English Language Institute specialist on question-asking.'],
  ['3637982', 'https://learningenglish.voanews.com/a/3637982.html',
    'Education', 'B1', 'educational', 'education', ['language-learning'],
    'Education Tips explainer on pronunciation goals with named university educators.'],
  ['4804792', 'https://learningenglish.voanews.com/a/can-language-learning-happen-during-sleep-/4804792.html',
    'Health & Psychology', 'B2', 'expository', 'psychology', ['education', 'language-learning'],
    'Reports sleep-based memory and vocabulary research from the University of Bern; the subject is cognition.'],
  ['2563047', 'https://learningenglish.voanews.com/a/2563047.html',
    'History', 'B1', 'expository', 'history', ['society'],
    'The Making of a Nation episode on the end of the American Civil War.'],
  ['1519967', 'https://learningenglish.voanews.com/a/1519967.html',
    'History', 'A2', 'expository', 'history', ['society'],
    'Special English history series on early European settler and Native American relations.'],
  ['2436970', 'https://learningenglish.voanews.com/a/2436970.html',
    'History', 'B1', 'expository', 'history', ['society'],
    'The Making of a Nation episode on southern secession and the Confederate constitution.'],
  ['1615769', 'https://learningenglish.voanews.com/a/plastic-recycling/1615769.html',
    'Environment', 'A2', 'expository', 'environment', ['science'],
    'Special English report on plastic recycling centres and a city plastic-bag tax.'],
  ['3913365', 'https://learningenglish.voanews.com/a/health-lifestyle-sleep-helps-us-learn/3913365.html',
    'Health & Psychology', 'B2', 'expository', 'psychology', ['healthcare', 'education'],
    'Health & Lifestyle report on sleep and memory research reported by a VOA reporter.'],
  ['2414963', 'https://learningenglish.voanews.com/a/artificial-intelligence/2414963.html',
    'Technology & AI', 'B1', 'expository', 'technology', ['science'],
    'Special English report on IBM brain-inspired microprocessor research, reported by VOA reporters.'],
  ['3472132', 'https://learningenglish.voanews.com/a/americas-national-parks-grand-canyon-august-20-2016/3472132.html',
    'Culture, Art & Travel', 'B1', 'expository', 'travel', ['science', 'culture'],
    "America's National Parks profile of the Grand Canyon, built from VOA archive and National Park Service material."],
  ['3482437', 'https://learningenglish.voanews.com/a/yellowstone-americas-first-national-park/3482437.html',
    'Culture, Art & Travel', 'B1', 'expository', 'travel', ['science', 'environment'],
    "America's National Parks profile of Yellowstone, built from VOA archive and National Park Service material."],
  ['3370560', 'https://learningenglish.voanews.com/a/americas-national-parks-nps-100-yosemite-national-park/3370560.html',
    'Culture, Art & Travel', 'B1', 'expository', 'travel', ['science', 'environment'],
    "America's National Parks profile of Yosemite, with VOA-presented park history and geology."],
];
