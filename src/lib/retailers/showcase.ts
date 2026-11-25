// The retailer shape the decorative backgrounds use (decision 0016: the landing tunnel, the
// sign-in wall, the rotating reward). Filled by server/catalog/showcase.ts.
export type ShowcaseRetailer = {
  id: string;
  name: string;
  logoFile: string;
  reward: string;
};
