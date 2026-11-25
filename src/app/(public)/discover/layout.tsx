import type { ReactNode } from "react";

// Discover with its `@modal` slot (decision 0016): clicking a card on Discover opens S-104 as a
// pop-up over the list (an intercepted route); a direct load or refresh shows the full page.
export default function DiscoverLayout({
  children,
  modal,
}: {
  children: ReactNode;
  modal: ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
