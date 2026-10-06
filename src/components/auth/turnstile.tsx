"use client";

import { useEffect, useRef } from "react";
import { publicEnv } from "@/lib/env/public";

// C-4 (SPEC §3.2, D4, NFR-11): Cloudflare Turnstile, managed mode. It writes the hidden
// `cf-turnstile-response` input the form posts; Supabase's CAPTCHA checks the token (actions
// never call siteverify). The script is loaded once, with the request's nonce: under
// 'strict-dynamic' a nonce'd script may load the challenge frame (frame-src allows Cloudflare).
// The submit button never waits for a token: a missing one comes back as M-6.

type TurnstileApi = {
  render(
    el: HTMLElement,
    options: { sitekey: string; action?: string; theme: "auto" },
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<TurnstileApi> | undefined;

function loadTurnstile(nonce: string): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.nonce = nonce;
    const fail = (why: string) => {
      loading = undefined; // let a later mount try again
      script.remove();
      reject(new Error(why));
    };
    script.onload = () =>
      window.turnstile
        ? resolve(window.turnstile)
        : fail("turnstile missing after load");
    script.onerror = () => fail("turnstile script failed to load");
    document.head.appendChild(script);
  });
  return loading;
}

export function Turnstile({
  nonce,
  action,
  formState,
}: {
  /** The request's CSP nonce (x-nonce), passed down from the server page. */
  nonce: string;
  /** Cloudflare's action label for this form (e.g. "sign-up"). */
  action?: string;
  /**
   * The form's useActionState state object itself (not a field of it): React gives a new object
   * after every submit, so the widget resets each time. Tokens are single-use (SPEC C-4).
   */
  formState: unknown;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  // Only the first load needs the nonce; a later render's new nonce mustn't re-render the widget.
  const firstNonce = useRef(nonce);

  useEffect(() => {
    let cancelled = false;
    loadTurnstile(firstNonce.current)
      .then((api) => {
        if (cancelled || !container.current) return;
        widgetId.current = api.render(container.current, {
          sitekey: publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
          action,
          theme: "auto",
        });
      })
      .catch(() => {
        // The form still submits; the action answers M-6 without a token (SPEC C-4).
      });
    return () => {
      cancelled = true;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = undefined;
    };
  }, [action]);

  const firstState = useRef(formState);
  useEffect(() => {
    if (formState !== firstState.current && widgetId.current)
      window.turnstile?.reset(widgetId.current);
  }, [formState]);

  // Normal size is 300 px wide, which fits 360 px screens with the page gutters (SPEC C-4).
  return <div ref={container} className="min-h-[65px]" />;
}
