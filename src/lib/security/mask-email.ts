// S-113 "Is this you?" (decision 0026): the account's email with the name part hidden, so a
// visitor can recognise their own address without the page spelling out someone else's.
// The first character and the whole domain stay; anything malformed shows only the mask.

const MASK = "•••";

export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return MASK;
  const first = Array.from(email.slice(0, at))[0];
  return `${first}${MASK}${email.slice(at)}`;
}
