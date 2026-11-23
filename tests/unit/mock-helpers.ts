import { vi } from "vitest";

// Shared vi.mock factories for action tests (import them inside the factory, since vi.mock is
// hoisted above imports):
//   vi.mock("@/server/errors", async (io) => (await import("./mock-helpers")).quietErrors(io));
//   vi.mock("@/server/security/rate-limit", async () => (await import("./mock-helpers")).allowAll);

/** The real errors module, with logError silenced. */
export async function quietErrors(importOriginal: () => Promise<unknown>) {
  return {
    ...((await importOriginal()) as typeof import("@/server/errors")),
    logError: vi.fn(),
  };
}

/** A limiter that always allows. */
export const allowAll = { rateLimit: async () => ({ ok: true }) };
