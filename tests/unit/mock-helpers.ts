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

/**
 * A fake `cookies()` store over a Map (name → value), for `next/headers` mocks:
 *   vi.mock("next/headers", async () => ({ cookies: (await import("./mock-helpers")).fakeCookies(jar) }));
 */
export function fakeCookies(jar: Map<string, string>) {
  return async () => ({
    getAll: () => [],
    get: (name: string) =>
      jar.has(name) ? { value: jar.get(name) } : undefined,
    set: (name: string, value: string) => jar.set(name, value),
    delete: (arg: string | { name: string }) =>
      jar.delete(typeof arg === "string" ? arg : arg.name),
  });
}
