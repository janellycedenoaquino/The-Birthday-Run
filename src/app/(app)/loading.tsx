// C-3 loading state for the signed-in area (SPEC §3.2): a quiet skeleton, no spinner wall.
export default function Loading() {
  return (
    <div
      className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6"
      aria-busy="true"
    >
      <div className="h-8 w-48 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
      <div className="mt-6 h-24 w-full animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
    </div>
  );
}
