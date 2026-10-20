// add-observability-telemetry (JOS-199), design Decisions 6 and 13 — the only attribute keys that may leave the
// machine. The relay drops everything else, and the backend telemetry test imports this same list, so a new
// attribute the app sends without being listed here fails a test instead of vanishing silently in production.
export const ALLOWED_ATTRIBUTE_KEYS: readonly string[] = [
  "service.name",
  "service.version",
  "service.instance.id",
  "deployment.environment",
  "os.type",
  "host.arch",
  "stage",
  "provider",
  "outcome",
  "unit",
  "error.code",
  "exception.message",
  "exception.stacktrace",
];
