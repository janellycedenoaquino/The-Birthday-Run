// The result every server action returns (BUILD §0.2, D17, D24.21). `error`, `message` and
// `fieldErrors` hold catalogue IDs or catalogue texts only (SPEC §3.4), never raw errors.
export type ActionResult<T = void> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };
