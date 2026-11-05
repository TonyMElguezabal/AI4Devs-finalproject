import { describe, expect, expectTypeOf, it } from "vitest";
import { CONNECTION_CHECKS, type ConnectionCheck } from "../src/providerConnectionCheck.ts";
import { ADAPTER_TYPES, ADAPTER_VENDORS, PARAMETER_SHAPES, type AdapterType, type AdapterTypeId } from "../src/providerTypes.ts";

// key-per-adapter-tables (JOS-262), design Decision 4 — every table that holds per-adapter-type behaviour is keyed by the
// shipped adapter types, so a new key in PARAMETER_SHAPES does not compile until each table has an entry for it. The type
// assertions run under `npm run typecheck`; vitest does not type-check.

const SHIPPED = Object.keys(PARAMETER_SHAPES);

describe("the per-adapter tables are keyed by the shipped adapter types", () => {
  it("types each table by AdapterTypeId, not by any string", () => {
    expectTypeOf(CONNECTION_CHECKS).toEqualTypeOf<Record<AdapterTypeId, ConnectionCheck>>();
    expectTypeOf(ADAPTER_VENDORS).toEqualTypeOf<Record<AdapterTypeId, string>>();
    expectTypeOf<AdapterType["id"]>().toEqualTypeOf<AdapterTypeId>();
  });

  it("rejects a table that misses an adapter type", () => {
    // @ts-expect-error every shipped adapter type needs a connection check
    const incomplete: typeof CONNECTION_CHECKS = { "openai-reasoning": CONNECTION_CHECKS["openai-reasoning"]! };
    expect(Object.keys(incomplete)).not.toEqual(SHIPPED);
  });

  it("lists exactly the shipped adapter types, the catalogue in their order", () => {
    expect(Object.keys(CONNECTION_CHECKS).sort()).toEqual([...SHIPPED].sort());
    expect(Object.keys(ADAPTER_VENDORS).sort()).toEqual([...SHIPPED].sort());
    expect(ADAPTER_TYPES.map((type) => type.id)).toEqual(SHIPPED);
  });
});
