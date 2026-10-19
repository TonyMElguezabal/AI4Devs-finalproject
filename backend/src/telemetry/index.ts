import { type Counter, type Histogram } from "@opentelemetry/api";
import { SeverityNumber } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider, type LogRecordExporter } from "@opentelemetry/sdk-logs";
import { MeterProvider, PeriodicExportingMetricReader, type PushMetricExporter } from "@opentelemetry/sdk-metrics";
import { BUILD } from "../config/build.ts";
import type { TelemetrySettings } from "../db.ts";
import { redactPaths } from "../util/redactPaths.ts";

// add-observability-telemetry (JOS-199), design Decisions 1–3 and 13 — the only door to OpenTelemetry. Call sites
// never touch the SDK: each record function checks its consent flag first and returns at once when it is off.
// Providers are created lazily, the first time a signal is on, so a user who opted out never loads an exporter.

export type ProductEvent = "app_start" | "session_started" | "final_video";
export type BilledUnit = { unit: "clip_seconds" | "images" | "voice_characters"; amount: number };
export type NormalizedOutcome = "success" | "transient" | "not-retryable" | "other";

type Exporters = { metrics: PushMetricExporter; logs: LogRecordExporter };
type Instruments = {
  calls: Counter;
  duration: Histogram;
  billed: Counter;
  appStarts: Counter;
  sessions: Counter;
  finalVideos: Counter;
};

let settings: TelemetrySettings = { errors: false, providerUsage: false, productUsage: false, answered: false, installId: "" };
let exporterOverride: Exporters | null = null;
let meterProvider: MeterProvider | null = null;
let loggerProvider: LoggerProvider | null = null;
let instruments: Instruments | null = null;
let logger: (message: string) => void = (message) => console.warn(message);
let lastWarningAt = 0;

/** Refreshed by the boot code and by `PUT /telemetry/consent`, so a change applies without a restart (Decision 3). */
export function setConsent(next: TelemetrySettings): void {
  settings = next;
}

export function getConsent(): TelemetrySettings {
  return settings;
}

/** Test seam, in the style of `setVoiceOverLogger`: in-memory exporters stand in for the OTLP ones. */
export function setTelemetryExportersForTest(exporters: Exporters): void {
  exporterOverride = exporters;
}

export function setTelemetryLogger(next: (message: string) => void): void {
  logger = next;
}

export function resetTelemetryForTest(): void {
  void meterProvider?.shutdown().catch(() => {});
  void loggerProvider?.shutdown().catch(() => {});
  meterProvider = loggerProvider = instruments = null;
  exporterOverride = null;
  lastWarningAt = 0;
  logger = (message) => console.warn(message);
  settings = { errors: false, providerUsage: false, productUsage: false, answered: false, installId: "" };
}

/** Decision 4 — one place maps both the stage-attempt and the provider-request vocabularies. */
export function normalizeOutcome(raw: string): NormalizedOutcome {
  switch (raw) {
    case "success":
    case "late-success":
      return "success";
    case "transient":
    case "transient_failure":
    case "timed-out":
      return "transient";
    case "not-retryable":
    case "not_retryable_failure":
      return "not-retryable";
    default:
      return "other";
  }
}

export function recordProviderCall(call: {
  stage: string;
  provider: string;
  outcome: string;
  latencyMs: number;
  billed?: BilledUnit;
}): void {
  if (!settings.providerUsage) return;
  guarded(() => {
    const { calls, duration, billed } = getInstruments();
    const outcome = normalizeOutcome(call.outcome);
    calls.add(1, { stage: call.stage, provider: call.provider, outcome });
    duration.record(call.latencyMs, { stage: call.stage, provider: call.provider });
    if (outcome === "success" && call.billed) {
      billed.add(call.billed.amount, { stage: call.stage, provider: call.provider, unit: call.billed.unit });
    }
  });
}

export function recordError(error: {
  stage?: string;
  provider?: string;
  errorCode?: string;
  outcome?: string;
  message: string;
  stack?: string;
}): void {
  if (!settings.errors) return;
  guarded(() => {
    getProviders();
    const attributes: Record<string, string> = { "exception.message": redactPaths(error.message) };
    if (error.stage) attributes.stage = error.stage;
    if (error.provider) attributes.provider = error.provider;
    if (error.errorCode) attributes["error.code"] = error.errorCode;
    if (error.outcome) attributes.outcome = error.outcome;
    if (error.stack) attributes["exception.stacktrace"] = redactPaths(error.stack);
    loggerProvider!.getLogger("vid4you").emit({
      severityNumber: SeverityNumber.ERROR,
      severityText: "ERROR",
      body: attributes["exception.message"],
      attributes,
    });
  });
}

export function recordProductEvent(event: ProductEvent): void {
  if (!settings.productUsage) return;
  guarded(() => {
    const { appStarts, sessions, finalVideos } = getInstruments();
    ({ app_start: appStarts, session_started: sessions, final_video: finalVideos })[event].add(1);
  });
}

/** Exports what is pending now. Never rejects: telemetry must not hold up a shutdown or a test. */
export async function flushTelemetry(): Promise<void> {
  await Promise.all([meterProvider?.forceFlush(), loggerProvider?.forceFlush()]).catch(() => {});
}

/** For SIGINT/SIGTERM — a bounded flush, so an unreachable endpoint cannot keep the process alive. */
export async function shutdownTelemetry(timeoutMs = 3000): Promise<void> {
  const done = Promise.all([meterProvider?.shutdown(), loggerProvider?.shutdown()]).catch(() => {});
  await Promise.race([done, new Promise((resolve) => setTimeout(resolve, timeoutMs).unref())]);
}

// ---- internals ----

function guarded(work: () => void): void {
  try {
    work();
  } catch (err) {
    warnOncePerMinute(`telemetry skipped: ${(err as Error).message}`);
  }
}

function warnOncePerMinute(message: string): void {
  const now = Date.now();
  if (now - lastWarningAt < 60_000) return;
  lastWarningAt = now;
  logger(redactPaths(message));
}

/** Wraps an exporter so a failed or throwing export becomes one throttled local warning instead of an error. */
function reportFailures<T extends { export: (items: any, done: (result: { code: number }) => void) => void }>(exporter: T): T {
  return Object.create(exporter, {
    export: {
      value: (items: unknown, done: (result: { code: number }) => void) => {
        const finish = (result: { code: number }) => {
          if (result.code !== 0) warnOncePerMinute("telemetry export failed; the endpoint may be unreachable");
          done(result);
        };
        try {
          exporter.export(items, finish);
        } catch {
          finish({ code: 1 });
        }
      },
    },
  });
}

function getProviders(): void {
  if (meterProvider && loggerProvider) return;
  const resource = resourceFromAttributes({
    "service.name": "vid4you",
    "service.version": BUILD.version,
    "deployment.environment": BUILD.channel,
    "os.type": process.platform === "win32" ? "windows" : process.platform,
    "host.arch": process.arch,
    "service.instance.id": settings.installId,
  });
  const metricExporter = exporterOverride?.metrics ?? new OTLPMetricExporter({ url: `${BUILD.telemetryEndpoint}/v1/metrics` });
  const logExporter = exporterOverride?.logs ?? new OTLPLogExporter({ url: `${BUILD.telemetryEndpoint}/v1/logs` });
  meterProvider = new MeterProvider({
    resource,
    readers: [new PeriodicExportingMetricReader({ exporter: reportFailures(metricExporter), exportIntervalMillis: 60_000 })],
  });
  loggerProvider = new LoggerProvider({ resource, processors: [new BatchLogRecordProcessor({ exporter: reportFailures(logExporter) })] });
}

function getInstruments(): Instruments {
  if (instruments) return instruments;
  getProviders();
  const meter = meterProvider!.getMeter("vid4you");
  instruments = {
    calls: meter.createCounter("vid4you_provider_calls_total"),
    duration: meter.createHistogram("vid4you_provider_call_duration_ms", {
      advice: { explicitBucketBoundaries: [1, 5, 15, 30, 60, 120, 300, 600, 1200].map((seconds) => seconds * 1000) },
    }),
    billed: meter.createCounter("vid4you_billed_units_total"),
    appStarts: meter.createCounter("vid4you_app_starts_total"),
    sessions: meter.createCounter("vid4you_sessions_started_total"),
    finalVideos: meter.createCounter("vid4you_final_videos_total"),
  };
  return instruments;
}
