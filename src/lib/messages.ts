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

  // App messages (SPEC §3.4): onboarding and settings (F-2)
  "M-105": "When's your birthday?",
  "M-106": "We only need the month and day, never the year.",
  "M-107": "Time zone: {timeZone}. You can change it in Settings.",
  "M-108": "Continue",
  "M-256":
    "Used to work out which day it is for you and when reminder emails go out.",
  "M-257": "Birthday saved.",
  "M-278":
    "In years without Feb 29 we count Feb 28. Some brands use Mar 1, so check their app.",
  "M-101": "Discover",
  "M-103": "Add",
  "M-104": "Added",
  "M-109": "Which programs are you in?",
  "M-110": "Save {count} programs",
  "M-111":
    "And {count} more birthday rewards. Sign up free to see them all and track your own.",
  "M-111b": "Choose programs to continue",
  "M-111c": "Skip for now",
  "M-118": "Step {step} of 2",
  "M-171": "No programs match that search.",
  "M-171a": "Discover",
  "M-171b": "Free birthday rewards from popular loyalty programs.",
  "M-171c": "Back to Discover",
  "M-178": "Showing {shown} of {total}",
  "M-179": "Nothing matches these filters.",
  "M-189a": "Purchase: {text}",
  "M-189b": "Membership: {text}",
  "M-189c": "Also: {text}",
  "M-277": "Join by {date} to get this one.",
  "M-277b":
    "{brand} needs members to join {days} days before the birthday, so it may not come this year.",
  "M-101b": "My Rewards",
  "M-120": "Last day",
  "M-122": "{days} days left",
  "M-123": "Ends soon",
  "M-124": "Coming up",
  "M-125": "Plenty of time",
  "M-126": "{count} picked up this Birthday Run",
  "M-127": "Last pickup: {date}",
  "M-128": "No pickups yet this Birthday Run.",
  "M-129a": "Find birthday rewards and add your programs.",
  "M-129b": "See what's open now and how long it lasts.",
  "M-201": "Happy birthday, {name}",
  "M-201b": "Happy birthday",
  "M-202": "Happy birth month, {name}",
  "M-202b": "Happy birth month",
  "M-203": "Your birthday's passed, but your rewards haven't.",
  "M-204": "Your birthday rewards",
  "M-205": "{days} days until your birthday",
  "M-206": "1 day until your birthday",
  "M-207": "Your rewards open on {date}. Add programs or plan your run now.",
  "M-209": "Show more",
  "M-211":
    "You haven't added any programs yet. Find the ones you belong to in Discover, then plan your run.",
  "M-212": "Nothing left to pick up right now. Nice work.",
  "M-276": "Brands may end it early by their own clock. Go early in the day.",
  "BR-1": "Add your birthday first.",
  "BR-18": "Choose a real date.",
  "BR-19": "Choose a time zone from the list.",
  "BR-3": "That program is no longer listed.",
} as const;

export type MessageId = keyof typeof M;

/** The catalogue text for a message ID. */
export const msg = (id: MessageId): string => M[id];
