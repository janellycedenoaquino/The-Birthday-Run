"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

// C-2's optional theme select (FR-21 "could"). The stored choice is only known in the browser, so
// the server and the first client render both show "System"; then the real value.
const subscribe = () => () => {};

export function ThemeSelect() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  return (
    <label className="inline-flex items-center gap-2">
      Theme
      <select
        value={mounted ? (theme ?? "system") : "system"}
        onChange={(event) => setTheme(event.target.value)}
        className="h-8 rounded-md border border-input bg-background px-2 text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
