// Every user-facing message, keyed by message ID (BUILD §0.3, D20, NFR-9). The wording's home is
// SPEC §3.4: change it there first, then here. Action results carry IDs, never text; `{email}`
// and `{name}` are filled in by the screen that shows the message. Pure: safe in client code.

export const M = {
  // Sign-in, sign-up and links
  "M-1":
    "We've sent a link to {email}. Open it to continue. If you already have an account, the link signs you in instead.",
  "M-2":
    "If there's an account for {email}, we've sent it a sign-in link. The link works once.",
  "M-3":
    "If there's an account for {email}, we've sent it a link to reset your password. The link works once.",
  "M-4": "Wrong email or password. Try again, or reset your password.",
  "M-5": "Too many attempts. Please try again in a few minutes.",
  "M-6": "The security check didn't work. Please try again.",
  "M-7": "Something went wrong. Please try again.",
  "M-8": "Didn't get it? Check your spam folder, or try again in a minute.",
  "M-9":
    "Google sign-in was cancelled. You can try again or use another way to sign in.",
  "M-10": "Please turn on JavaScript to continue.",
  "M-11":
    "This link has expired or has already been used. Links from our emails work once.",
  "M-12":
    "Something went wrong while signing in with Google. Please try again.",
  "M-13": "This link has expired or has already been used.",

  // Guards and edge cases
  "API-1": "Your session has ended. Please sign in again.",
  "API-2": "Enter the code from your authenticator app to continue.",
  "API-3": "Choose a password to finish setting up your account.",
  "API-4": "Please check the fields below.",
  "API-5": "Two-step sign-in is already on.",
  "API-6": "Your password is already set.",
  "API-7": "Choose a password you haven't used for this account.",

  // Two-step sign-in
  "M-14": "That code didn't work. Check the app and try the newest code.",
  "M-15": "Couldn't start setup. Please try again.",
  "M-16": "Two-step sign-in is on.",
  "M-17": "Two-step sign-in is off.",
  "M-18": "Key copied.",

  // Account and settings
  "M-19": "That password isn't right. Try again.",
  "M-20": "For your security, confirm it's you before changing this.",
  "M-21": "Name saved.",
  "M-22": "Password changed. You've been signed out on your other devices.",
  "M-23": "You sign in with Google, so there's no password to change.",
  "M-24": "That doesn't match your email address.",
  "M-25": "We couldn't prepare your download. Please try again.",

  // Arrival notices (?notice=)
  "M-26": "Your account has been deleted.",
  "M-27": "You're all set.",
  "M-28": "Password changed.",

  // Field errors (BUILD §0.5)
  "M-29": "Enter your email address.",
  "M-30": "Enter a valid email address.",
  "M-31": "Enter your password.",
  "M-32": "Use at least 12 characters.",
  "M-33": "That password is too long. Use a shorter one.",
  "M-34": "Enter the 6-digit code.",
  "M-35": "Enter a name.",
  "M-36": "Use 80 characters or fewer.",
  "M-37": "Remove line breaks and tabs from your name.",

  // Pages
  "M-38":
    "We couldn't find that page. It may have moved, or the link may be wrong.",
  "M-39": "Please try again. If it keeps happening, contact support.",
  "M-40": "Placeholder text. Replace this page before launch.",
  "M-41":
    'For your security, set your password with a reset link instead: use "Forgot password" on the sign-in page.',
} as const;

export type MessageId = keyof typeof M;

/** The catalogue text for a message ID. */
export const msg = (id: MessageId): string => M[id];
