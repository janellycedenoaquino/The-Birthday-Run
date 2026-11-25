import type Stripe from "stripe";

// Fakes for the F-8 tests (BUILD F-8 "Tests", §0.8): a Stripe client with the few calls the app
// makes, and an in-memory stand-in for the admin/user Supabase client over `subscriptions` and
// `stripe_events`. Only the query shapes src/server/billing and actions/billing use exist here.

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

export function fakeDb(tables: Record<string, Row[]> = {}) {
  const data: Record<string, Row[]> = {
    subscriptions: [],
    stripe_events: [],
    ...tables,
  };
  const keyOf: Record<string, string> = {
    subscriptions: "user_id",
    stripe_events: "id",
  };

  function query(table: string) {
    const filters: Filter[] = [];
    let op: "select" | "upsert" | "update" | "delete" = "select";
    let payload: Row = {};
    let ignoreDuplicates = false;
    let returning = false;
    const rows = () => data[table]!.filter((r) => filters.every((f) => f(r)));

    const run = (): { data: unknown; error: null } => {
      if (op === "upsert") {
        const key = keyOf[table]!;
        const exists = data[table]!.some((r) => r[key] === payload[key]);
        if (exists && ignoreDuplicates)
          return { data: returning ? [] : null, error: null };
        data[table]!.push({
          received_at: new Date().toISOString(),
          ...payload,
        });
        return { data: returning ? [payload] : null, error: null };
      }
      if (op === "update") {
        const hit = rows();
        for (const r of hit) Object.assign(r, payload);
        return { data: hit, error: null };
      }
      if (op === "delete") {
        const hit = new Set(rows());
        data[table] = data[table]!.filter((r) => !hit.has(r));
        return { data: null, error: null };
      }
      return { data: rows(), error: null };
    };

    const q = {
      select() {
        if (op !== "select") returning = true;
        return q;
      },
      upsert(row: Row, opts?: { ignoreDuplicates?: boolean }) {
        op = "upsert";
        payload = row;
        ignoreDuplicates = Boolean(opts?.ignoreDuplicates);
        return q;
      },
      update(values: Row) {
        op = "update";
        payload = values;
        return q;
      },
      delete() {
        op = "delete";
        return q;
      },
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return q;
      },
      lt(col: string, val: string) {
        filters.push((r) => String(r[col]) < val);
        return q;
      },
      async maybeSingle() {
        const r = run().data as Row[];
        return { data: r[0] ?? null, error: null };
      },
      async single() {
        const r = run().data as Row[];
        return r[0]
          ? { data: r[0], error: null }
          : { data: null, error: { message: "no row" } };
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve(run()).then(resolve, reject);
      },
    };
    return q;
  }

  return { data, client: { from: (table: string) => query(table) } };
}

const sub = (
  id: string,
  status: string,
  created: number,
  extra: Partial<{ cancel_at_period_end: boolean; period_end: number }> = {},
) =>
  ({
    id,
    status,
    created,
    cancel_at_period_end: extra.cancel_at_period_end ?? false,
    items: {
      data: [{ current_period_end: extra.period_end ?? 1_900_000_000 }],
    },
  }) as unknown as Stripe.Subscription;
export { sub };

/** A fake Stripe: every call is recorded in `calls`; `subscriptions` is what Stripe "has". */
export function fakeStripe() {
  const state = {
    calls: [] as string[],
    subscriptions: [] as Stripe.Subscription[],
    listFailures: 0,
    nextCustomer: 1,
    sessionParams: null as Record<string, unknown> | null,
    portalParams: null as Record<string, unknown> | null,
  };
  const stripe = {
    customers: {
      create: async () => {
        state.calls.push("customers.create");
        return { id: `cus_new${state.nextCustomer++}` };
      },
      del: async (id: string) => {
        state.calls.push(`customers.del ${id}`);
        return { id, deleted: true };
      },
    },
    subscriptions: {
      list: async () => {
        state.calls.push("subscriptions.list");
        if (state.listFailures > 0) {
          state.listFailures--;
          throw new Error("stripe unavailable");
        }
        return { data: state.subscriptions };
      },
      cancel: async (id: string) => {
        state.calls.push(`subscriptions.cancel ${id}`);
        return { id };
      },
    },
    checkout: {
      sessions: {
        create: async (params: Record<string, unknown>) => {
          state.calls.push("checkout.sessions.create");
          state.sessionParams = params;
          return { url: "https://checkout.stripe.com/c/pay/cs_test_1" };
        },
      },
    },
    billingPortal: {
      sessions: {
        create: async (params: Record<string, unknown>) => {
          state.calls.push("billingPortal.sessions.create");
          state.portalParams = params;
          return { url: "https://billing.stripe.com/p/session/test_1" };
        },
      },
    },
    webhooks: {
      constructEvent: (body: string, signature: string, secret: string) => {
        state.calls.push("webhooks.constructEvent");
        if (signature !== `valid:${secret}`) throw new Error("bad signature");
        return JSON.parse(body) as Stripe.Event;
      },
    },
  };
  return { stripe, state };
}

export const event = (
  id: string,
  type: string,
  object: Record<string, unknown>,
) => ({ id, type, data: { object } }) as unknown as Stripe.Event;
