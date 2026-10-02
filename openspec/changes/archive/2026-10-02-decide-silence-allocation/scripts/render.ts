// decide-silence-allocation (JOS-142) task 4.2 — generates the real assets
// for the rendered comparison and the threshold sweep: one real reasoning
// call for IMAGE/VIDEO instructions, real Fal.ai images, real RunningHub
// clips. Submits every clip concurrently (each takes 3-7 minutes) and polls
// them all together.
//
// Base comparison (design Decision 3.3): the 4 real fragments english-
// exclamation-paragraph groups under rule B, each at its own admitted
// duration — fragment0 (sentence0+1, 11s), fragment1 (=sentence2, 8s),
// fragment2 (sentence3+4, 14s), fragment3 (sentence5+6, 13s).
//
// Threshold sweep (task 4.1's pick, Decision 3.4): fragment0 (11.448s) fails
// the "<8s, so rule A's +4s stays under 15s" safety margin, so the sweep uses
// the two individual SENTENCES flanking the longest native pause (1.115s)
// instead of the full fragment0/fragment1 grouping — sentence1 alone (6.966s)
// and sentence2 (=fragment1, 7.882s), both comfortably under 8s. Both sweep
// clips are requested at 15s so every sweep render plays at exactly 1.0x
// (trimmed, never retimed), isolating the silence judgement from JOS-182's
// speed-factor subject.
//
// Usage: node render.ts <out-dir>

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { loadCredential } from "../../../../backend/src/config/credentials.ts";
import { IMAGE_GENERATION_SIZE, VIDEO_PROVIDER } from "../../../../backend/src/config/providers.ts";
import { createOpenAiVisualInstructionGenerator } from "../../../../backend/src/visualInstructions.ts";

const OUT = process.argv[2]!;
const RH = "https://www.runninghub.ai";
const rhKey = loadCredential("RUNNINGHUB_API_KEY");
const rhHeaders = { authorization: `Bearer ${rhKey}` };

interface ClipSpec {
  /** Unique id used for filenames; not necessarily the fragment index. */
  id: string;
  text: string;
  durationSeconds: number;
  /** If set, reuse this other clip's image instead of generating a new one. */
  reuseImageFrom?: string;
}

// The 5 distinct texts needing an image: 4 base fragments + "sentence1 alone" for the sweep.
const IMAGE_TEXTS: Record<string, string> = {
  fragment0: "The captain shouted across the deck, and the crew answered at once! Waves crashed against the hull as the storm grew stronger, but nobody left their post that night.",
  fragment1: "Ropes were checked, sails were lowered, and every lantern was lit before the heavy rain began to fall.",
  fragment2: "The old ship had weathered worse nights than this one, and everyone aboard knew it well. By dawn, the sea had calmed completely, leaving only quiet water and a pale, gentle morning sky.",
  fragment3: "The crew gathered on deck to share a warm meal, tired but relieved that the worst had finally passed. Someone began to sing an old song about distant harbors, and slowly the others joined in.",
  "sentence1-alone": "Waves crashed against the hull as the storm grew stronger, but nobody left their post that night.",
};

// The 6 clips to request: 4 base (own admitted duration) + 2 sweep (15s each, sharing fragment0/fragment1's text split differently).
const CLIPS: ClipSpec[] = [
  { id: "fragment0", text: IMAGE_TEXTS.fragment0!, durationSeconds: 11 },
  { id: "fragment1", text: IMAGE_TEXTS.fragment1!, durationSeconds: 8 },
  { id: "fragment2", text: IMAGE_TEXTS.fragment2!, durationSeconds: 14 },
  { id: "fragment3", text: IMAGE_TEXTS.fragment3!, durationSeconds: 13 },
  { id: "sweep-before", text: IMAGE_TEXTS["sentence1-alone"]!, durationSeconds: 15, reuseImageFrom: "sentence1-alone" },
  { id: "sweep-after", text: IMAGE_TEXTS.fragment1!, durationSeconds: 15, reuseImageFrom: "fragment1" }, // = sentence2, reuse fragment1's image
];

async function main() {
  // 1. One real reasoning call for IMAGE/VIDEO instructions on the 5 distinct texts.
  const imageIds = Object.keys(IMAGE_TEXTS);
  const generator = createOpenAiVisualInstructionGenerator({ timeoutMs: 60000 }); // POC-only override; production uses PER_PHASE_MAX_TIME_SECONDS.decomposition (20s)
  const instructionsPath = `${OUT}/render-instructions.json`;
  let instructions: Record<string, { image: string; video: string }>;
  if (existsSync(instructionsPath)) {
    console.log("(using cached instructions)");
    instructions = JSON.parse(readFileSync(instructionsPath, "utf8"));
  } else {
    const result = await generator.generate(imageIds.map((id) => IMAGE_TEXTS[id]!), "en");
    if (result.kind !== "success") throw new Error(`instruction generation failed: ${result.kind} ${JSON.stringify(result)}`);
    instructions = Object.fromEntries(imageIds.map((id, i) => [id, result.pairs[i]!]));
    writeFileSync(instructionsPath, JSON.stringify(instructions, null, 2));
  }
  for (const id of imageIds) console.log(`${id}: IMAGE="${instructions[id]!.image.slice(0, 70)}…" VIDEO="${instructions[id]!.video.slice(0, 70)}…"`);

  // 2. One real Fal.ai image per distinct text (5 images).
  const imagePaths: Record<string, string> = {};
  for (const id of imageIds) {
    const path = `${OUT}/image-${id}.png`;
    if (existsSync(path)) {
      console.log(`(using cached image ${id})`);
    } else {
      const started = Date.now();
      const res = await fetch("https://fal.run/fal-ai/flux/dev", {
        method: "POST",
        headers: { authorization: `Key ${loadCredential("FAL_API_KEY")}`, "content-type": "application/json" },
        body: JSON.stringify({ prompt: instructions[id]!.image, image_size: IMAGE_GENERATION_SIZE, num_images: 1 }),
      });
      const body: any = await res.json();
      if (!res.ok) throw new Error(`image failed for ${id}: HTTP ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
      console.log(`image ${id}: HTTP ${res.status} in ${((Date.now() - started) / 1000).toFixed(1)}s, ${body.images?.[0]?.width}x${body.images?.[0]?.height}`);
      writeFileSync(path, Buffer.from(await (await fetch(body.images[0].url)).arrayBuffer()));
    }
    imagePaths[id] = path;
  }

  // 3. Upload each distinct image to RunningHub once.
  const uploadUrls: Record<string, string> = {};
  for (const id of imageIds) {
    const uploadCachePath = `${OUT}/upload-${id}.json`;
    if (existsSync(uploadCachePath)) {
      uploadUrls[id] = JSON.parse(readFileSync(uploadCachePath, "utf8")).url;
      console.log(`(using cached upload ${id})`);
      continue;
    }
    const form = new FormData();
    form.append("file", new Blob([readFileSync(imagePaths[id]!)], { type: "image/png" }), `${id}.png`);
    const upload = await fetch(`${RH}/openapi/v2/media/upload/binary`, { method: "POST", headers: rhHeaders, body: form });
    const uploadBody: any = await upload.json();
    const url = uploadBody.data?.download_url ?? uploadBody.data?.url;
    if (!upload.ok || !url) throw new Error(`upload failed for ${id}: ${JSON.stringify(uploadBody).slice(0, 300)}`);
    uploadUrls[id] = url;
    writeFileSync(uploadCachePath, JSON.stringify({ url }));
    console.log(`upload ${id}: ${url}`);
  }

  // 4. Submit every clip concurrently. Task ids are persisted immediately, so a
  // rerun after a crash resumes polling in-flight (already-paid-for) tasks
  // instead of resubmitting and double-spending.
  const taskIdsPath = `${OUT}/render-task-ids.json`;
  const taskIds: Record<string, string> = existsSync(taskIdsPath) ? JSON.parse(readFileSync(taskIdsPath, "utf8")) : {};
  for (const clip of CLIPS) {
    const clipPath = `${OUT}/clip-${clip.id}.mp4`;
    if (existsSync(clipPath)) {
      console.log(`(clip ${clip.id} already rendered)`);
      continue;
    }
    if (taskIds[clip.id]) {
      console.log(`(clip ${clip.id} already submitted, taskId ${taskIds[clip.id]})`);
      continue;
    }
    const imageId = clip.reuseImageFrom ?? clip.id;
    const videoInstruction = instructions[imageId]!.video;
    const submit = await fetch(`${RH}${VIDEO_PROVIDER.endpoint}`, {
      method: "POST",
      headers: { ...rhHeaders, "content-type": "application/json" },
      body: JSON.stringify({ prompt: videoInstruction, resolution: "768P", duration: clip.durationSeconds, firstFrameUrl: uploadUrls[imageId] }),
    });
    const submitted: any = await submit.json();
    const taskId: string | undefined = submitted.taskId ?? submitted.data?.taskId;
    if (!submit.ok || !taskId) throw new Error(`submit failed for ${clip.id}: ${JSON.stringify(submitted).slice(0, 300)}`);
    taskIds[clip.id] = taskId;
    writeFileSync(taskIdsPath, JSON.stringify(taskIds, null, 2));
    console.log(`submitted ${clip.id}: ${clip.durationSeconds}s, taskId ${taskId}`);
  }

  // 5. Poll all submitted clips together until every one resolves.
  const pending = new Set(Object.keys(taskIds));
  let totalCost = 0;
  const startedAt = Date.now();
  while (pending.size > 0) {
    await new Promise((r) => setTimeout(r, 10000));
    for (const id of [...pending]) {
      const q = await fetch(`${RH}/openapi/v2/query`, { method: "POST", headers: { ...rhHeaders, "content-type": "application/json" }, body: JSON.stringify({ taskId: taskIds[id] }) });
      const result: any = await q.json();
      if (result.status === "SUCCESS") {
        const url = result.results[0].url;
        writeFileSync(`${OUT}/clip-${id}.mp4`, Buffer.from(await (await fetch(url)).arrayBuffer()));
        const cost = Number(result.usage?.thirdPartyConsumeMoney ?? 0);
        totalCost += cost;
        console.log(`  ${id}: SUCCESS after ${((Date.now() - startedAt) / 1000).toFixed(0)}s, cost $${cost}`);
        pending.delete(id);
      } else if (result.status === "FAILED") {
        console.log(`  ${id}: FAILED ${JSON.stringify(result).slice(0, 300)}`);
        pending.delete(id);
      }
    }
    if (pending.size > 0) console.log(`  ...${pending.size} still pending (${[...pending].join(", ")})`);
  }

  console.log(`\nAll clips resolved. RunningHub spend this run: $${totalCost.toFixed(3)}`);
  for (const clip of CLIPS) {
    const path = `${OUT}/clip-${clip.id}.mp4`;
    if (existsSync(path)) {
      const duration = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).toString().trim();
      console.log(`  ${clip.id}: requested ${clip.durationSeconds}s, measured ${duration}s`);
    }
  }
}

main();
