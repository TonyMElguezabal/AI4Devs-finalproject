// Sentence detection for script segmentation (segment-script-into-chunks,
// design Decision 1). A sentence ends at . ! ? … (a run of them, and any
// closing quotes or brackets right after) when whitespace or the end of the
// script follows — except after a known abbreviation or a single capital
// letter. Whatever follows the last terminator is the last sentence.

export interface Sentence {
  text: string;
  /** Offset of the first character in the script. */
  start: number;
  /** Offset just past the last character in the script. */
  end: number;
}

const TERMINATORS: ReadonlySet<string> = new Set([".", "!", "?", "…"]);
const CLOSERS: ReadonlySet<string> = new Set(['"', "'", "”", "’", ")", "]", "}", "»"]);
const OPENERS = /^[("'“‘\[{«¿¡]+/u;

const ENGLISH_ABBREVIATIONS: ReadonlySet<string> = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc", "e.g", "i.e", "no", "fig",
]);
const SPANISH_ABBREVIATIONS: ReadonlySet<string> = new Set([
  "sr", "sra", "srta", "dr", "dra", "ud", "uds", "pág", "págs", "etc", "vs", "núm", "av", "lic", "ing",
]);

function abbreviationsFor(language: string): ReadonlySet<string> {
  return language.toLowerCase().startsWith("es") ? SPANISH_ABBREVIATIONS : ENGLISH_ABBREVIATIONS;
}

/** True when the word right before the period at `periodIndex` is an abbreviation or an initial. */
function followsAbbreviation(script: string, periodIndex: number, abbreviations: ReadonlySet<string>): boolean {
  let tokenStart = periodIndex;
  while (tokenStart > 0 && !/\s/u.test(script[tokenStart - 1]!)) tokenStart--;
  const token = script.slice(tokenStart, periodIndex).replace(OPENERS, "");
  if (token === "") return false;
  return abbreviations.has(token.toLowerCase()) || /^\p{Lu}$/u.test(token);
}

/**
 * Trims `script.slice(rawStart, rawEnd)` down to an exact substring span: the
 * offsets move inward past any leading/trailing whitespace, so `text` is
 * always `script.slice(start, end)`. Shared with clause-piece splitting
 * (`clauseSplitting.ts`), which trims sub-sentence ranges the same way.
 */
export function trimSpan(script: string, rawStart: number, rawEnd: number): Sentence | null {
  const raw = script.slice(rawStart, rawEnd);
  const text = raw.trim();
  if (text === "") return null;
  const start = rawStart + (raw.length - raw.trimStart().length);
  return { text, start, end: start + text.length };
}

export function findSentences(script: string, language: string): Sentence[] {
  const abbreviations = abbreviationsFor(language);
  const sentences: Sentence[] = [];
  let sentenceStart = 0;

  const pushSentence = (rawStart: number, rawEnd: number): void => {
    const span = trimSpan(script, rawStart, rawEnd);
    if (span) sentences.push(span);
  };

  let index = 0;
  while (index < script.length) {
    if (!TERMINATORS.has(script[index]!)) {
      index++;
      continue;
    }
    let runEnd = index;
    while (runEnd + 1 < script.length && TERMINATORS.has(script[runEnd + 1]!)) runEnd++;
    let sentenceEnd = runEnd;
    while (sentenceEnd + 1 < script.length && CLOSERS.has(script[sentenceEnd + 1]!)) sentenceEnd++;

    const followedByBreak = sentenceEnd + 1 >= script.length || /\s/u.test(script[sentenceEnd + 1]!);
    const isSinglePeriod = runEnd === index && script[index] === ".";
    const isAbbreviation = isSinglePeriod && followsAbbreviation(script, index, abbreviations);

    if (followedByBreak && !isAbbreviation) {
      pushSentence(sentenceStart, sentenceEnd + 1);
      sentenceStart = sentenceEnd + 1;
    }
    index = sentenceEnd + 1;
  }
  pushSentence(sentenceStart, script.length);
  return sentences;
}
