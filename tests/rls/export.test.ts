import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { USER_DATA_TABLES } from "@/server/data/registry";
import { createUser, deleteUsers, type TestUser } from "./helpers";

// A fixed name, so the slug rule is tested the same way in every app made from the Template.
vi.mock("@/config/app", async (importOriginal) => {
  const { appConfig } = await importOriginal<typeof import("@/config/app")>();
  return { appConfig: { ...appConfig, name: "Template App" } };
});

// The data export against local Supabase (BUILD F-11 "Tests", FR-15, NFR-16, D13; phase 4 "done
// when"): with the user's own client it has every registry table and nothing of anyone else.
const { buildExport, exportFilename } = await import("@/server/data/export");

let a: TestUser;
let b: TestUser;
beforeAll(async () => {
  a = await createUser("export-a");
  b = await createUser("export-b");
  await b.client
    .from("profiles")
    .update({ display_name: "Someone Else" })
    .eq("id", b.id);
});
afterAll(() => deleteUsers(a, b));

describe("buildExport (FR-15)", () => {
  it("has every registry table, only A's rows, and A's account fields", async () => {
    const {
      data: { user },
    } = await a.client.auth.getUser();
    const file = await buildExport(
      a.client,
      user!,
      new Date("2026-09-29T12:00:00Z"),
    );

    expect(Object.keys(file.data).sort()).toEqual(
      USER_DATA_TABLES.map((t) => `${t.schema}.${t.table}`).sort(),
    );
    expect(file.data["public.profiles"]).toHaveLength(1);
    expect(file.data["public.profiles"][0]).toMatchObject({ id: a.id });
    expect(JSON.stringify(file)).not.toContain(b.id);
    expect(JSON.stringify(file)).not.toContain("Someone Else");
    expect(file.account).toMatchObject({
      id: a.id,
      email: a.email,
      providers: ["email"],
      mfa_enabled: false,
    });
  });

  it("holds no tokens or provider data (NFR-16)", async () => {
    const {
      data: { user },
    } = await a.client.auth.getUser();
    const text = JSON.stringify(await buildExport(a.client, user!, new Date()));
    for (const key of [
      "access_token",
      "refresh_token",
      "identity_data",
      "secret",
      "factors",
    ])
      expect(text).not.toContain(`"${key}"`);
  });

  it("names the file <app-slug>-data-<date>.json", () => {
    expect(exportFilename(new Date("2026-09-29T12:00:00Z"))).toBe(
      "template-app-data-2026-09-29.json",
    );
  });
});
