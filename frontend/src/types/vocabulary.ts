export type VocabularyStatus = 'learning' | 'learned';

export interface VocabularyWord {
  id: string;
  word: string;
  phonetic?: string;
  /** UK (RP) IPA transcription. Optional so entries saved earlier still load. */
  phoneticUk?: string;
  partOfSpeech?: string;
  meaning: string;
  meaningVi?: string;
  example?: string;
  exampleVi?: string;
  audioUrl?: string;
  sourceArticleId: string;
  sourceArticleTitle: string;
  status: VocabularyStatus;
  savedAt: string;
}

export type VocabularyFilter = 'All' | 'Learning' | 'Learned';
