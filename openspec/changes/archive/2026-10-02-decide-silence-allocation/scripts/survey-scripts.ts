// decide-silence-allocation (JOS-142) task 2.1 — the four pause-survey
// scripts. Between them they contain a period, a question mark, an
// exclamation mark, commas, one paragraph break, one ellipsis and one dash,
// so the survey (task 2.2) measures a representative range of real pauses.

export interface SurveyScript {
  label: string;
  language: "en" | "es";
  /** The punctuation feature this script was written to exercise, beyond ordinary periods and commas. */
  feature: string;
  script: string;
}

export const SURVEY_SCRIPTS: SurveyScript[] = [
  {
    label: "english-question-dash",
    language: "en",
    feature: "question mark, em dash",
    script:
      "The old lighthouse keeper walked along the rocky shoreline every single morning, checking each lantern with great care. Why did he never miss a single day, even in the coldest winter storms? The answer was simple — he had promised his father, many years ago, that the light would never go dark. Ships still passed this stretch of coast at night, guided only by that steady beam alone. He trusted the routine completely, and the routine never once let the sailors down through all those years. Every evening, before the sun disappeared behind the hills, he climbed the narrow spiral staircase one careful step at a time. He cleaned the glass, trimmed the wick, and waited quietly for the darkness to settle over the water.",
  },
  {
    label: "english-exclamation-paragraph",
    language: "en",
    feature: "exclamation mark, paragraph break",
    script:
      "The captain shouted across the deck, and the crew answered at once!\n\nWaves crashed against the hull as the storm grew stronger, but nobody left their post that night. Ropes were checked, sails were lowered, and every lantern was lit before the heavy rain began to fall. The old ship had weathered worse nights than this one, and everyone aboard knew it well. By dawn, the sea had calmed completely, leaving only quiet water and a pale, gentle morning sky. The crew gathered on deck to share a warm meal, tired but relieved that the worst had finally passed. Someone began to sing an old song about distant harbors, and slowly the others joined in.",
  },
  {
    label: "spanish-question",
    language: "es",
    feature: "signos de interrogación",
    script:
      "El viejo farero caminaba por la costa rocosa cada mañana, revisando cada farol con mucho cuidado. ¿Por qué nunca faltaba a su rutina, ni siquiera en las tormentas más frías del invierno? La respuesta era sencilla: le había prometido a su padre, hace muchos años, que la luz nunca se apagaría del todo. Los barcos todavía pasaban por esta costa durante la noche, guiados solo por ese haz constante. Confiaba completamente en la rutina, y la rutina nunca defraudaba a los marineros. Cada tarde, antes de que el sol desapareciera tras las colinas, subía la estrecha escalera de caracol con mucho cuidado. Limpiaba el cristal, ajustaba la mecha y esperaba en silencio a que la oscuridad cubriera el mar.",
  },
  {
    label: "spanish-exclamation-ellipsis",
    language: "es",
    feature: "signos de exclamación, puntos suspensivos",
    script:
      "El capitán gritó desde la cubierta, y la tripulación respondió de inmediato... Las olas golpeaban el casco mientras la tormenta crecía, pero nadie abandonó su puesto esa noche. Las cuerdas fueron revisadas, las velas bajadas, y cada farol encendido antes de que comenzara la lluvia fuerte. ¡El viejo barco había resistido noches mucho peores que esta! Al amanecer, el mar se había calmado por completo, dejando solo agua tranquila y un cielo pálido y sereno. La tripulación se reunió en la cubierta para compartir una comida caliente, cansada pero aliviada de que lo peor hubiera pasado. Alguien empezó a cantar una vieja canción sobre puertos lejanos, y poco a poco los demás se unieron.",
  },
];
