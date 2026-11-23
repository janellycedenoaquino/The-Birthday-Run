// next/navigation for unit tests: redirect() throws like Next's, with the target as `url`, and
// unstable_rethrow passes those through. Use as vi.mock("next/navigation", () => import(...)).
export const redirect = (url: string) => {
  throw Object.assign(new Error(`NEXT_REDIRECT ${url}`), { url });
};

export const unstable_rethrow = (error: unknown) => {
  if (error instanceof Error && error.message.startsWith("NEXT_REDIRECT"))
    throw error;
};
