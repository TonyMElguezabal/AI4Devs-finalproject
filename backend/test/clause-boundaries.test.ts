import { describe, expect, it } from "vitest";
import { cutAtClauseBoundaries, findClauseBoundaries } from "../src/clauseBoundaries.ts";

// split-sentences-at-clause-boundaries (JOS-141), group 2 — design Decisions 1
// and 4: a boundary lies right after a comma/semicolon followed by whitespace,
// or right before a listed conjunction preceded by whitespace and not the
// sentence's first word; a comma/semicolon directly followed by a conjunction
// counts once, after the punctuation. Cutting at the boundaries gives trimmed
// exact substrings that join back to the sentence apart from whitespace.

describe("Where a clause boundary lies (Decision 1)", () => {
  it("lies after a comma or a semicolon, before a listed conjunction, and counts '; and' once", () => {
    const sentence = "The boats came in, the gulls rose; and the town woke because the bells rang";
    const boundaries = findClauseBoundaries(sentence, "en");
    expect(boundaries).toEqual([
      sentence.indexOf(",") + 1,
      sentence.indexOf(";") + 1,
      sentence.indexOf("because"),
    ]);
  });

  it("has no boundary inside a number", () => {
    const sentence = "The dock held 1,000 boats that day.";
    const boundaries = findClauseBoundaries(sentence, "en");
    expect(boundaries).toEqual([]);
  });

  it("finds Spanish conjunctions", () => {
    const sentence = "Los barcos volvieron y las gaviotas volaron porque sonaron las campanas";
    const boundaries = findClauseBoundaries(sentence, "es");
    expect(boundaries).toEqual([sentence.indexOf(" y ") + 1, sentence.indexOf("porque")]);
  });

  it("never treats the sentence's first word as a conjunction boundary", () => {
    const sentence = "But the harbor stayed calm all night.";
    expect(findClauseBoundaries(sentence, "en")).toEqual([]);
  });

  it("does not match a conjunction that is only a substring of another word", () => {
    const sentence = "The crew tried to organize the nets and store the catch.";
    const boundaries = findClauseBoundaries(sentence, "en");
    expect(boundaries).toEqual([sentence.indexOf("and")]);
  });

  it("is case-insensitive", () => {
    const sentence = "The tide turned, AND the boats returned.";
    expect(findClauseBoundaries(sentence, "en")).toEqual([sentence.indexOf(",") + 1]);
  });

  it("does not treat a Spanish conjunction as an English one, or the reverse", () => {
    expect(findClauseBoundaries("The boat left o'clock and returned.", "en")).toEqual([
      "The boat left o'clock and returned.".indexOf("and"),
    ]);
    expect(findClauseBoundaries("El barco salió y volvió pero se quedó.", "en")).toEqual([]);
  });

  it("returns nothing for a sentence with no boundary", () => {
    expect(findClauseBoundaries("The harbor was calm.", "en")).toEqual([]);
  });

  it("returns boundaries in ascending order for several conjunctions", () => {
    const sentence = "The tide rose but the wind fell and the sky cleared.";
    const boundaries = findClauseBoundaries(sentence, "en");
    expect(boundaries).toEqual([sentence.indexOf("but"), sentence.indexOf("and")]);
  });
});

describe("Cutting at the boundaries (Decision 4)", () => {
  it("gives trimmed exact substrings that join back to the sentence apart from whitespace", () => {
    const sentence = "The boats came in, the gulls rose; and the town woke because the bells rang";
    const pieces = cutAtClauseBoundaries(sentence, findClauseBoundaries(sentence, "en"));
    expect(pieces).toEqual(["The boats came in,", "the gulls rose;", "and the town woke", "because the bells rang"]);
    for (const piece of pieces) expect(piece).toBe(piece.trim());
    expect(pieces.join(" ")).toBe(sentence);
  });

  it("gives back the whole sentence, trimmed, when there is no boundary", () => {
    const sentence = "The harbor was calm.";
    expect(cutAtClauseBoundaries(sentence, [])).toEqual([sentence]);
  });

  it("drops a piece that is only whitespace between two adjacent boundaries", () => {
    expect(cutAtClauseBoundaries("a  b", [1, 2])).toEqual(["a", "b"]);
  });

  it("keeps accents and inverted marks intact in Spanish", () => {
    const sentence = "¿Cómo estás, señor Núñez, y qué opinas porque el mar cambió?";
    const boundaries = findClauseBoundaries(sentence, "es");
    const pieces = cutAtClauseBoundaries(sentence, boundaries);
    for (const piece of pieces) expect(piece).toBe(piece.trim());
    expect(pieces.join(" ")).toBe(sentence);
  });

  it("reproduces the sentence for several boundaries in English", () => {
    const sentence = "The tide rose but the wind fell and the sky cleared.";
    const boundaries = findClauseBoundaries(sentence, "en");
    const pieces = cutAtClauseBoundaries(sentence, boundaries);
    expect(pieces).toHaveLength(3);
    expect(pieces.join(" ")).toBe(sentence);
  });
});
