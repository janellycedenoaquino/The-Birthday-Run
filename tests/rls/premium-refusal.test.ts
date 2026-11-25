import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setPremium } from "../../scripts/grant-premium";
import {
  ACTIONS_DIR as dir,
  actionFiles,
  birthdayTodayWith,
  CAPTCHA_TOKEN,
  createUser,
  deleteUsers,
  groupWith,
  PASSWORD,
  sql,
  type TestUser,
} from "./helpers";

// Metric 2 (BUILD F-7 "Tests", NFR-2, T-101): a real free account, signed in through the app's
// own server client against local Supabase, calls every premium server action with well-formed
// input and gets BR-2 each time. Only Next's request APIs are faked: the session lives in an
// in-memory cookie jar, so requireUser, requireOnboarded, getEntitlement and requirePremium all
// run for real. The database functions' own refusals (nearby_stores, zip_location,
// apply_group_suggestions) are tested in public.retailer_stores and apply-group-suggestions.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ "x-pathname": "/plan", "x-forwarded-for": "203.0.113.7" }),
  cookies: async () => ({
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => {
      if (value) jar.set(name, value);
      else jar.delete(name);
    },
    has: (name: string) => jar.has(name),
  }),
}));
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

const { createClient } = await import("@/server/supabase/server");
const files = actionFiles();

/** Every exported action whose body calls requirePremium(), read from the source. */
function premiumActionNames(): string[] {
  const names: string[] = [];
  for (const file of files) {
    const source = readFileSync(resolve(dir, file), "utf8");
    for (const part of source.split(/^export async function /m).slice(1)) {
      const name = part.match(/^\w+/)?.[0];
      if (name && part.includes("requirePremium()")) names.push(name);
    }
  }
  return names.sort();
}

const ZERO_UUID = "00000000-0000-4000-8000-000000000000";
let db: ReturnType<typeof sql>;
let free: TestUser;
let groupId = ZERO_UUID;

// Well-formed input for each premium action, so the refusal comes from requirePremium, not Zod.
// The group is the free user's own, so ownership can't be the reason either.
const FORM: Record<string, () => Record<string, string>> = {
  duplicateGroup: () => ({ groupId }),
  setReminders: () => ({ enabled: "on" }),
};
const JSON_INPUT: Record<string, () => unknown> = {
  applySuggestions: () => ({
    groups: [
      {
        retailerIds: ["starbucks"],
        pickupDate: new Date().toISOString().slice(0, 10),
        pickupTime: "23:30",
      },
    ],
  }),
  lookupZip: () => ({ start: { kind: "zip", zip: "10001" } }),
  findStops: () => ({
    start: { kind: "coords", lat: 40.713, lng: -74.006 },
    retailerIds: ["starbucks"],
  }),
  getGroupRoute: () => ({ start: { kind: "zip", zip: "10001" }, groupId }),
  suggestGroups: () => ({ start: { kind: "zip", zip: "10001" } }),
};

type FormAction = (prev: unknown, fd: FormData) => Promise<unknown>;
type JsonAction = (input: unknown) => Promise<unknown>;

async function call(name: string): Promise<unknown> {
  for (const file of files) {
    const fn = (await import(resolve(dir, file)))[name];
    if (typeof fn !== "function") continue;
    if (name in JSON_INPUT) return (fn as JsonAction)(JSON_INPUT[name]!());
    const fd = new FormData();
    for (const [k, v] of Object.entries(FORM[name]!())) fd.set(k, v);
    return (fn as FormAction)(null, fd);
  }
  throw new Error(`no action named ${name}`);
}

beforeAll(async () => {
  db = sql();
  free = await createUser("premium-refusal");
  await birthdayTodayWith(free, ["starbucks"]);
  groupId = await groupWith(free, "My run", ["starbucks"]);
  // The app's own sign-in path: the server client writes the session into the cookie jar.
  const { error } = await (
    await createClient()
  ).auth.signInWithPassword({
    email: free.email,
    password: PASSWORD,
    options: { captchaToken: CAPTCHA_TOKEN },
  });
  if (error) throw new Error(`cookie sign-in failed: ${error.message}`);
});
afterAll(async () => {
  await deleteUsers(free);
  await db.end();
});

describe("a free account is refused every premium action (metric 2, NFR-2)", () => {
  it("finds the premium actions (the test can't silently check nothing)", () => {
    expect(premiumActionNames()).toEqual(
      Object.keys({ ...FORM, ...JSON_INPUT }).sort(),
    );
  });

  it.each(premiumActionNames())("%s → BR-2", async (name) => {
    expect(await call(name)).toEqual({ ok: false, error: "BR-2" });
  });

  it("the same session, once granted, gets past the premium check", async () => {
    await setPremium(db, free.email, "grant");
    try {
      expect(await call("setReminders")).toMatchObject({ ok: true });
    } finally {
      await setPremium(db, free.email, "revoke");
    }
  });
});
