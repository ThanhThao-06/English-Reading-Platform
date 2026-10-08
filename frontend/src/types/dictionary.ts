export interface DictionaryEntry {
  /** Headword of the dictionary entry (the resolved lemma, e.g. "oceans" -> "ocean"). */
  word: string;
  /** Standard IPA transcription. Defaults to the US/General American pronunciation. */
  phonetic?: string;
  /** Standard IPA transcription of the UK (RP) pronunciation when the source provides one. */
  phoneticUk?: string;
  partOfSpeech?: string;
  /** English definition written for learners. */
  meaning: string;
  /** Vietnamese translation of the headword. */
  meaningVi?: string;
  /** Example sentence demonstrating usage of the word. */
  example?: string;
  /** Vietnamese translation of the example sentence. */
  exampleVi?: string;
  /** Direct URL to a pronunciation recording. Falls back to the Web Speech API when absent. */
  audioUrl?: string;
}

/** Why a lookup failed, so the UI can show a friendly message instead of a raw error. */
export type DictionaryErrorKind = 'not-found' | 'network';

/** Error thrown by the dictionary service. Never surface `message` directly to the user. */
export class DictionaryLookupError extends Error {
  readonly kind: DictionaryErrorKind;

  constructor(kind: DictionaryErrorKind) {
    super(kind === 'not-found' ? 'WORD_NOT_FOUND' : 'DICTIONARY_NETWORK_ERROR');
    this.name = 'DictionaryLookupError';
    this.kind = kind;
  }
}

export type LookupState = 'idle' | 'loading' | 'success' | 'error';
