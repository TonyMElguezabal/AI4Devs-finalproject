// JOS-188 throwaway probe — evidence for the reports, not product code (design Decision 1). It drives the real
// ElevenLabs and RunningHub adapters through a fetch that records each call's status, selected headers and, on an
// error, a short body. It never logs a request header, so no key reaches the output.
//
//   SECRETS_PATH=<secrets file> DB_PATH=<scratch> PROJECTS_ROOT=<scratch> PROVIDER_KEY_PATH=<scratch> \
//   node probe.ts eleven <runs>                      voice-only 5/6/7 and the two mixed shapes, `runs` times each
//   node probe.ts video <concurrency> <image.png>    one RunningHub level; 1 is a sequential baseline
//
// Results are appended to $PROBE_OUT (a directory) as JSON lines.

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { createElevenLabsAlignmentProvider } from "../../../../backend/src/alignmentProvider.ts";
import { loadCredential } from "../../../../backend/src/config/credentials.ts";
import { createElevenLabsVoiceProvider } from "../../../../backend/src/voiceProvider.ts";
import { createRunningHubVideoProvider } from "../../../../backend/src/videoProvider.ts";

const OUT = process.env.PROBE_OUT;
if (!OUT) throw new Error("PROBE_OUT must name the results directory");
mkdirSync(OUT, { recursive: true });

const VOICE = { voiceId: "4YYIPFl9wE5c4L2eu2Gb", model: "eleven_multilingual_v2", outputFormat: "mp3_44100_128" } as const;
const SCRIPT = "Testing the limit.";
/** Voice text for the mixed shapes: long enough (~360 characters) that the voice calls are still in flight when the alignment calls start. */
const LONG_SCRIPT = `${SCRIPT} `.repeat(20).trim();
// Balance debited per 5 s 2K job in the two baselines ($2.04-2.16); RunningHub itemizes only $0.60 of it.
const VIDEO_PRICE_USD = 2.16;
const SPEND_CEILING_USD = 30;
const JOB_TIMEOUT_MS = 1500_000;
const POLL_INTERVAL_MS = 1000;

interface HttpRecord { url: string; status: number; headers: Record<string, string>; body?: string; videoStatus?: string; taskId?: string; consumeMoney?: unknown; atMs: number }

function record(line: Record<string, unknown>): void {
  appendFileSync(`${OUT}/results.jsonl`, `${JSON.stringify(line)}\n`);
  console.log(JSON.stringify(line));
}

/** A fetch that appends what it saw to `sink`; response bodies are read from a clone, the adapter still gets the original. */
function recordingFetch(sink: HttpRecord[], origin: number): typeof fetch {
  return async (input, init) => {
    const response = await fetch(input, init);
    const url = String(input instanceof Request ? input.url : input);
    const headers: Record<string, string> = {};
    response.headers.forEach((value, name) => { if (/concurr|ratelimit|retry-after|queue/i.test(name)) headers[name] = value; });
    const entry: HttpRecord = { url: new URL(url).pathname, status: response.status, headers, atMs: Date.now() - origin };
    const text = await response.clone().text().catch(() => "");
    if (!response.ok) entry.body = text.slice(0, 240);
    if (entry.url.endsWith("/query")) {
      try {
        const parsed = JSON.parse(text) as { status?: string; taskId?: string; usage?: Record<string, unknown> };
        entry.videoStatus = String(parsed.status ?? "");
        if (parsed.taskId) entry.taskId = parsed.taskId;
        // RunningHub itemizes the real price of a finished task in `usage` (JOS-165 step 15: `thirdPartyConsumeMoney`).
        if (parsed.usage && (parsed.status === "SUCCESS" || parsed.status === "FAILED")) entry.consumeMoney = parsed.usage;
      } catch { /* not JSON */ }
    }
    sink.push(entry);
    return response;
  };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// ---- ElevenLabs ----

async function voiceCall(text: string, origin: number): Promise<{ http: HttpRecord[]; kind: string; ms: number; audio?: Uint8Array }> {
  const http: HttpRecord[] = [];
  const provider = createElevenLabsVoiceProvider({ fetchFn: recordingFetch(http, origin), loadKey: () => loadCredential("ELEVENLABS_KEY") });
  const started = Date.now();
  const result = await provider.synthesize({ text, language: "en", ...VOICE, speed: "default" });
  return { http, kind: result.kind, ms: Date.now() - started, ...(result.kind === "success" ? { audio: result.audio } : {}) };
}

async function alignCall(audio: Uint8Array, origin: number): Promise<{ http: HttpRecord[]; kind: string; ms: number }> {
  const http: HttpRecord[] = [];
  const provider = createElevenLabsAlignmentProvider({ fetchFn: recordingFetch(http, origin), loadKey: () => loadCredential("ELEVENLABS_KEY") });
  const started = Date.now();
  const result = await provider.align(audio, SCRIPT);
  return { http, kind: result.kind, ms: Date.now() - started };
}

/** `voices` voice calls at once, then `aligns` alignment calls `alignDelayMs` later (voice takes ~2.3 s, alignment ~0.4 s). */
async function elevenShape(name: string, voices: number, aligns: number, audio: Uint8Array): Promise<void> {
  const origin = Date.now();
  const calls = [
    ...Array.from({ length: voices }, () => voiceCall(aligns > 0 ? LONG_SCRIPT : SCRIPT, origin).then((r) => ({ stage: "voice", ...r }))),
    ...Array.from({ length: aligns }, () => sleep(300).then(() => alignCall(audio, origin)).then((r) => ({ stage: "alignment", ...r }))),
  ];
  const results = await Promise.all(calls);
  record({ provider: "elevenlabs", shape: name, voices, aligns, concurrent: voices + aligns, results: results.map((r) => ({ stage: r.stage, kind: r.kind, ms: r.ms, http: r.http })) });
}

/** `filter` keeps only the shapes whose name starts with it (for example `mixed` or `align`). */
async function eleven(runs: number, filter: string | undefined): Promise<void> {
  const seed = await voiceCall(SCRIPT, Date.now());
  record({ provider: "elevenlabs", shape: "seed", concurrent: 1, results: [{ stage: "voice", kind: seed.kind, ms: seed.ms, http: seed.http }] });
  if (!seed.audio) throw new Error(`seed voice call failed: ${seed.kind}`);
  const audio = seed.audio;
  for (let run = 1; run <= runs; run += 1) {
    for (const shape of [
      { name: "voice-5", v: 5, a: 0 }, { name: "voice-6", v: 6, a: 0 }, { name: "voice-7", v: 7, a: 0 },
      { name: "mixed-3v-3a", v: 3, a: 3 }, { name: "mixed-5v-1a", v: 5, a: 1 },
      { name: "align-6", v: 0, a: 6 }, { name: "align-8", v: 0, a: 8 }, { name: "align-10", v: 0, a: 10 },
    ].filter((s) => filter === undefined || s.name.startsWith(filter))) {
      await elevenShape(`${shape.name}#${run}`, shape.v, shape.a, audio);
      await sleep(8000); // let any provider-side count drain before the next shape
    }
  }
}

// ---- RunningHub ----

async function balanceUsd(): Promise<number> {
  const response = await fetch("https://www.runninghub.ai/uc/openapi/accountStatus", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apikey: loadCredential("RUNNINGHUB_API_KEY") }),
  });
  const body = await response.json() as { data?: { remainMoney?: string; currentTaskCounts?: string } };
  return Number(body.data?.remainMoney);
}

async function videoJob(index: number, image: Buffer, origin: number): Promise<Record<string, unknown>> {
  const http: HttpRecord[] = [];
  const provider = createRunningHubVideoProvider({ fetchFn: recordingFetch(http, origin), loadKey: () => loadCredential("RUNNINGHUB_API_KEY") });
  const submitted = await provider.submit({ imageBytes: image, instruction: "A calm lake at sunrise, the camera slowly pushes in.", durationSeconds: 5 });
  const submitAtMs = Date.now() - origin;
  if (submitted.kind !== "submitted") return { index, outcome: submitted.kind, reason: submitted.reason, submitAtMs, http };
  let outcome = "unfinished";
  while (Date.now() - origin - submitAtMs < JOB_TIMEOUT_MS) {
    const polled = await provider.poll(submitted.requestId);
    if (polled.kind === "success") { outcome = "success"; break; }
    if (polled.kind !== "pending") { outcome = polled.kind; break; }
    await sleep(POLL_INTERVAL_MS);
  }
  const doneAtMs = Date.now() - origin;
  const polls = http.filter((h) => h.videoStatus !== undefined);
  const firstRunning = polls.find((h) => h.videoStatus === "RUNNING");
  return {
    index, outcome, submitAtMs, doneAtMs, totalMs: doneAtMs, generationMs: doneAtMs - submitAtMs,
    toRunningMs: firstRunning ? firstRunning.atMs - submitAtMs : null,
    statuses: [...new Set(polls.map((h) => h.videoStatus))],
    taskId: polls.find((h) => h.taskId)?.taskId ?? null,
    consumeMoney: polls.find((h) => h.consumeMoney !== undefined)?.consumeMoney ?? null,
    errors: http.filter((h) => h.status >= 400),
  };
}

async function video(concurrency: number, imagePath: string): Promise<void> {
  const before = await balanceUsd();
  const stateFile = `${OUT}/start-balance.txt`;
  let startBalance = before;
  try { startBalance = Number(readFileSync(stateFile, "utf8")); } catch { appendFileSync(stateFile, String(before)); }
  const spent = startBalance - before;
  if (spent + concurrency * VIDEO_PRICE_USD > SPEND_CEILING_USD) {
    throw new Error(`spend guard: $${spent.toFixed(3)} spent + ${concurrency} x $${VIDEO_PRICE_USD} would pass the $${SPEND_CEILING_USD} ceiling`);
  }
  const image = readFileSync(imagePath);
  const origin = Date.now();
  const jobs = await Promise.all(Array.from({ length: concurrency }, (_, index) => videoJob(index, image, origin)));
  const after = await balanceUsd();
  await sleep(60_000); // RunningHub's balance can post a charge late; read it again once it settles
  const settled = await balanceUsd();
  record({ provider: "runninghub", concurrency, startedAt: new Date(origin).toISOString(), balanceBefore: before, balanceAfter: after, balanceSettled: settled, levelCostUsd: Number((before - settled).toFixed(3)), spentSoFarUsd: Number((startBalance - settled).toFixed(3)), jobs });
}

const [command, first, second] = process.argv.slice(2);
if (command === "eleven") await eleven(Number(first ?? 1), second);
else if (command === "video" && second) await video(Number(first), second);
else throw new Error("usage: probe.ts eleven <runs> | probe.ts video <concurrency> <image.png>");
