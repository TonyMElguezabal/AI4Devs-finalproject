import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

// cover-error-reporting (JOS-255), design D5 — stands in for the relay: `@opentelemetry/exporter-logs-otlp-http` sends
// OTLP as JSON, so collecting the bodies of `POST /v1/logs` is enough. Metrics are accepted and ignored.

type OtlpValue = { stringValue?: string };
type OtlpLogRecord = { body?: OtlpValue; attributes?: Array<{ key: string; value: OtlpValue }> };
type OtlpLogsBody = { resourceLogs?: Array<{ scopeLogs?: Array<{ logRecords?: OtlpLogRecord[] }> }> };

/** One exported log record, flattened: its body and its string attributes. */
export interface ReceivedLogRecord {
  body: string;
  attributes: Record<string, string>;
}

export interface FakeOtlpReceiver {
  url: string;
  records(): ReceivedLogRecord[];
  close(): Promise<void>;
}

export async function startFakeOtlpReceiver(): Promise<FakeOtlpReceiver> {
  const received: ReceivedLogRecord[] = [];
  const server = createServer((request, response) => {
    let text = "";
    request.on("data", (chunk: Buffer) => (text += chunk.toString()));
    request.on("end", () => {
      if (request.url === "/v1/logs") {
        const body = JSON.parse(text) as OtlpLogsBody;
        for (const resource of body.resourceLogs ?? []) {
          for (const scope of resource.scopeLogs ?? []) {
            for (const record of scope.logRecords ?? []) {
              const attributes = Object.fromEntries((record.attributes ?? []).map(({ key, value }) => [key, value.stringValue ?? ""]));
              received.push({ body: record.body?.stringValue ?? "", attributes });
            }
          }
        }
      }
      response.writeHead(200, { "Content-Type": "application/json" }).end("{}");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    records: () => [...received],
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
