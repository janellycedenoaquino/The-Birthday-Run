// The share card's logo wall (src/app/opengraph-image.tsx): the owner's most popular brands that
// are live in data/retailers.csv, chosen 2026-11-26. The first seven fill the left column, the rest the right. A unit test checks each is live and its file
// exists. Ulta Beauty and The Cheesecake Factory are left out: their files have a baked-in
// checkerboard.
export const SHARE_BRANDS = [
  // Left column, top: mostly above the frame (owner, 2026-11-26: show there are lots of brands).
  { id: "cold-stone-creamery", logoFile: "cold-stone-creamery.png" },
  { id: "starbucks", logoFile: "starbucks.png" },
  { id: "sephora", logoFile: "sephora.png" },
  { id: "chipotle", logoFile: "chipotle.png" },
  { id: "chick-fil-a", logoFile: "chick-fil-a.svg" },
  { id: "dunkin-donuts", logoFile: "dunkin-donuts.svg" },
  // The last card of each column runs off the edge, so the wall reads as bigger than the card
  // (owner, 2026-11-26): Red Lobster under Dunkin', Krispy Kreme above Panera.
  { id: "red-lobster", logoFile: "red-lobster.svg" },
  { id: "krispy-kreme", logoFile: "krispy-kreme.png" },
  { id: "panera-bread", logoFile: "panera-bread.png" },
  { id: "bath-and-body-works", logoFile: "bath-and-body-works.png" },
  { id: "olive-garden", logoFile: "olive-garden.svg" },
  { id: "panda-express", logoFile: "panda-express.png" },
  { id: "cvs", logoFile: "cvs.svg" },
  // Right column, bottom: mostly below the frame.
  { id: "build-a-bear", logoFile: "build-a-bear.png" },
] as const;
