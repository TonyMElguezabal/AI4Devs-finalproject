import { describe, expect, it } from "vitest";
import { findSentences } from "../src/sentences.ts";

// segment-script-into-chunks (JOS-140), group 3 — design Decision 1: a
// sentence ends at . ! ? … (with any closing quotes or brackets right after)
// followed by whitespace or the end, except after a known abbreviation or a
// single capital letter; text after the last terminator is the last sentence.

const texts = (script: string, language = "en") => findSentences(script, language).map((s) => s.text);

describe("Where a sentence ends", () => {
  it("ends at a period, an exclamation mark, a question mark and an ellipsis", () => {
    expect(texts("One. Two! Three? Four… Five.")).toEqual(["One.", "Two!", "Three?", "Four…", "Five."]);
  });

  it("treats three periods like an ellipsis", () => {
    expect(texts("Wait... What happened? Nothing.")).toEqual(["Wait...", "What happened?", "Nothing."]);
  });

  it("keeps a run of terminators together", () => {
    expect(texts("Really?! Yes.")).toEqual(["Really?!", "Yes."]);
  });

  it("keeps closing quotes and brackets with the sentence they close", () => {
    expect(texts('He said "Go." Then he left.')).toEqual(['He said "Go."', "Then he left."]);
    expect(texts("(See above.) Next one.")).toEqual(["(See above.)", "Next one."]);
    expect(texts("She said “Stop!” He stopped.")).toEqual(["She said “Stop!”", "He stopped."]);
  });

  it("makes the words after the last terminator the last sentence", () => {
    expect(texts("First one. Last words without an end")).toEqual(["First one.", "Last words without an end"]);
  });

  it("finds one sentence in a script with no terminator", () => {
    expect(texts("Just some words")).toEqual(["Just some words"]);
  });

  it("does not end a sentence at a period that is not followed by whitespace", () => {
    expect(texts("It costs 3.50 today. Fine.")).toEqual(["It costs 3.50 today.", "Fine."]);
    expect(texts("Visit example.com now. Done.")).toEqual(["Visit example.com now.", "Done."]);
  });

  it("handles line breaks between sentences", () => {
    expect(texts("First.\n\nSecond.\nThird.")).toEqual(["First.", "Second.", "Third."]);
  });

  it("returns nothing for an empty or blank script", () => {
    expect(findSentences("", "en")).toEqual([]);
    expect(findSentences("  \n ", "en")).toEqual([]);
  });
});

describe("Abbreviations and initials", () => {
  it.each([
    ["Mr. Smith arrived. He left.", ["Mr. Smith arrived.", "He left."]],
    ["Dr. Jones and Mrs. Lee met. They talked.", ["Dr. Jones and Mrs. Lee met.", "They talked."]],
    ["Take fruit, e.g. apples. Then go.", ["Take fruit, e.g. apples.", "Then go."]],
    ["It was ok, i.e. fine. Really.", ["It was ok, i.e. fine.", "Really."]],
    ["J. Smith wrote it. Done.", ["J. Smith wrote it.", "Done."]],
    ["Fast vs. slow is a choice. Pick one.", ["Fast vs. slow is a choice.", "Pick one."]],
    ["MR. SMITH arrived. He left.", ["MR. SMITH arrived.", "He left."]],
  ])("English: %s", (script, expected) => {
    expect(texts(script, "en")).toEqual(expected);
  });

  it.each([
    ["Sra. López llegó. Se fue.", ["Sra. López llegó.", "Se fue."]],
    ["El Dr. Pérez y la Dra. Ruiz hablaron. Fin.", ["El Dr. Pérez y la Dra. Ruiz hablaron.", "Fin."]],
    ["Lee la pág. tres. Después sigue.", ["Lee la pág. tres.", "Después sigue."]],
  ])("Spanish: %s", (script, expected) => {
    expect(texts(script, "es")).toEqual(expected);
  });

  it("finds Spanish sentences with inverted marks", () => {
    expect(texts("¿Cómo estás? ¡Muy bien! Gracias.", "es")).toEqual(["¿Cómo estás?", "¡Muy bien!", "Gracias."]);
  });

  it("uses the English abbreviations for an unknown language", () => {
    expect(texts("Mr. Smith arrived. He left.", "fr")).toEqual(["Mr. Smith arrived.", "He left."]);
  });

  it("does not treat an English abbreviation as one in Spanish, or the reverse", () => {
    expect(texts("Vio a Mr. Then he went.", "es")).toEqual(["Vio a Mr.", "Then he went."]);
    expect(texts("She met Sra. Then left.", "en")).toEqual(["She met Sra.", "Then left."]);
  });

  it("ends the script's last sentence even when it finishes with an abbreviation", () => {
    expect(texts("He works with Dr.")).toEqual(["He works with Dr."]);
  });
});

describe("The sentences are exact substrings", () => {
  const script = '  First one.  \n\nSecond, with "quotes." Third!  ';

  it("returns each sentence trimmed, with its offsets in the script", () => {
    for (const sentence of findSentences(script, "en")) {
      expect(script.slice(sentence.start, sentence.end)).toBe(sentence.text);
      expect(sentence.text).toBe(sentence.text.trim());
    }
  });

  it("returns them in order, without overlap", () => {
    const sentences = findSentences(script, "en");
    for (let i = 1; i < sentences.length; i++) expect(sentences[i]!.start).toBeGreaterThanOrEqual(sentences[i - 1]!.end);
  });

  it("joined with single spaces, reproduces the script apart from whitespace", () => {
    const sample = "Mr. Smith arrived at 3.50. \"Hello!\" he said... Then, quietly, he left (finally).\n\nNo terminator here";
    const joined = findSentences(sample, "en").map((s) => s.text).join(" ");
    expect(joined.replace(/\s+/g, "")).toBe(sample.replace(/\s+/g, ""));
  });

  it("keeps accents and inverted marks intact", () => {
    const sample = "¿Qué pasó, señor Núñez? ¡Nada!";
    expect(findSentences(sample, "es").map((s) => s.text)).toEqual(["¿Qué pasó, señor Núñez?", "¡Nada!"]);
  });
});
