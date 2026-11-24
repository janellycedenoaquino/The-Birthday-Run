import { describe, expect, it, vi } from "vitest";

// BUILD F-7 "Tests": getEntitlement is FR-35's one answer per request and fails closed.
vi.mock("server-only", () => ({}));
const logError = vi.fn();
vi.mock("@/server/errors", () => ({ logError }));

const { getEntitlement } = await import("@/server/premium/entitlement");
const client = (result: { data: unknown; error: unknown }) =>
  ({ rpc: vi.fn(async () => result) }) as never;

describe("getEntitlement (FR-35)", () => {
  it("true only when the database says exactly true", async () => {
    expect(await getEntitlement(client({ data: true, error: null }))).toEqual({
      premium: true,
    });
    expect(await getEntitlement(client({ data: false, error: null }))).toEqual({
      premium: false,
    });
    expect(await getEntitlement(client({ data: null, error: null }))).toEqual({
      premium: false,
    });
  });

  it("an RPC error is logged and reads as free (fails closed)", async () => {
    const r = await getEntitlement(
      client({ data: true, error: { message: "boom" } }),
    );
    expect(r).toEqual({ premium: false });
    expect(logError).toHaveBeenCalledWith(
      { message: "boom" },
      { op: "getEntitlement" },
    );
  });
});
