"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

// next-themes (FR-21): follows the device setting by default. Its no-flash <script> carries the
// request's CSP nonce, passed down from the root layout (D5).
export function ThemeProvider(
  props: ComponentProps<typeof NextThemesProvider>,
) {
  return <NextThemesProvider {...props} />;
}
