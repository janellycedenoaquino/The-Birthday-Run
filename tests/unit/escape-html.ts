// Escapes text the way React's server renderer does, so tests can look for config values
// (an app's name may hold `'` or `&`) in rendered HTML.
export const escapeHtml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
