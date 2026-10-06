import { appConfig } from "@/config/app";

// Renders a SPEC §3.4 message with its "contact support" phrase as the support mailto link
// (M-39 and others). The text itself stays in src/lib/messages.ts; only the phrase is linked.
const PHRASE = "contact support";

export function SupportLinkText({ text }: { text: string }) {
  const at = text.indexOf(PHRASE);
  if (at === -1) return text;
  return (
    <>
      {text.slice(0, at)}
      <a
        href={`mailto:${appConfig.supportEmail}`}
        className="underline underline-offset-4"
      >
        {PHRASE}
      </a>
      {text.slice(at + PHRASE.length)}
    </>
  );
}
