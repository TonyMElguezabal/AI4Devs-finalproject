// Clause boundary detection for sentence splitting (split-sentences-at-clause-
// boundaries, design Decisions 1 and 4). A boundary lies right after a comma
// or semicolon followed by whitespace, or right before a listed conjunction
// of the script's language that follows whitespace (so never the sentence's
// first word); a comma or semicolon directly followed by a conjunction counts
// once, after the punctuation.

const ENGLISH_CONJUNCTIONS = [
  "and", "but", "or", "nor", "so", "yet", "because", "although", "though", "while", "whereas", "unless", "until", "since",
];
const SPANISH_CONJUNCTIONS = ["y", "e", "o", "u", "ni", "pero", "sino", "aunque", "porque", "mientras", "pues"];

function conjunctionsFor(language: string): readonly string[] {
  return language.toLowerCase().startsWith("es") ? SPANISH_CONJUNCTIONS : ENGLISH_CONJUNCTIONS;
}

/** True when `sentence[position - 1]` starts a run of whitespace immediately preceded by `,` or `;`. */
function directlyAfterPunctuation(sentence: string, position: number): boolean {
  let index = position;
  while (index > 0 && /\s/u.test(sentence[index - 1]!)) index--;
  return index > 0 && (sentence[index - 1] === "," || sentence[index - 1] === ";");
}

/** Clause boundary offsets into `sentence`, ascending, each a valid cut position (Decision 1). */
export function findClauseBoundaries(sentence: string, language: string): number[] {
  const boundaries = new Set<number>();

  const punctuation = /[,;](?=\s)/gu;
  for (const match of sentence.matchAll(punctuation)) boundaries.add(match.index + 1);

  // The end check is a Unicode-aware word boundary, not `\b`: JS's `\b` treats
  // an accented letter (e.g. "ñ") as a non-word character, so "ni" would
  // falsely match the start of "niña".
  const conjunctions = conjunctionsFor(language);
  const pattern = new RegExp(`(?<=\\s)(${conjunctions.join("|")})(?![\\p{L}\\p{N}])`, "giu");
  for (const match of sentence.matchAll(pattern)) {
    if (!directlyAfterPunctuation(sentence, match.index)) boundaries.add(match.index);
  }

  return [...boundaries].sort((a, b) => a - b);
}

/** The trimmed, exact-substring pieces `boundaries` cut `sentence` into (Decision 4). */
export function cutAtClauseBoundaries(sentence: string, boundaries: readonly number[]): string[] {
  const cuts = [0, ...boundaries, sentence.length];
  const pieces: string[] = [];
  for (let index = 0; index + 1 < cuts.length; index++) {
    const piece = sentence.slice(cuts[index]!, cuts[index + 1]!).trim();
    if (piece !== "") pieces.push(piece);
  }
  return pieces;
}
