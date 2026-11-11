import { rmSync } from "node:fs";

export default function teardown(): void {
  if (process.env.E2E_SCRATCH) rmSync(process.env.E2E_SCRATCH, { recursive: true, force: true });
}
