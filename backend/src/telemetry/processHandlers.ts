import { recordError, shutdownTelemetry } from "./index.ts";

// add-observability-telemetry (JOS-199), group 4 — report an uncaught exception or unhandled rejection, then keep
// today's behavior: print it and exit with 1 (Node's default for both). Registering a listener removes that
// default, so the exit is reinstated here, after a bounded flush so the report can leave the machine.
export function installProcessErrorHandlers(
  proc: Pick<NodeJS.Process, "on"> = process,
  exit: (code: number) => void = (code) => process.exit(code),
  print: (error: unknown) => void = (error) => console.error(error),
): void {
  const report = (reason: unknown) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    recordError({ errorCode: error.name, message: error.message, stack: error.stack });
    void shutdownTelemetry(2000).finally(() => {
      print(reason);
      exit(1);
    });
  };
  proc.on("uncaughtException", report);
  proc.on("unhandledRejection", report);
}
