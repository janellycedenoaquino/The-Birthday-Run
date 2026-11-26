// What findStops and getGroupRoute return (BUILD F-10). Plain data, so the stop list and links
// render without the map (NFR-7). Pure: safe in client code.

export type RouteStop = {
  n: number;
  retailerId: string;
  retailerName: string;
  /** The logo in public/retailers/, for the map pin (decision 0016). */
  logoFile: string | null;
  storeName: string;
  address: string | null;
  lat: number;
  lng: number;
  milesFromPrevious: number;
};

export type RouteResult = {
  /** The resolved start (a ZIP's centroid), for the map pin only. */
  start: { lat: number; lng: number };
  stops: RouteStop[];
  noPin: {
    retailerId: string;
    retailerName: string;
    finderUrl: string | null;
  }[];
  /** Google Maps URLs, one per leg (FR-34). */
  legs: string[];
};

/** suggestGroups' answer (BUILD F-11: FR-29). Suggestions only; nothing is saved. */
export type Suggestion = {
  retailerIds: string[];
  stops: RouteStop[];
  pickupDate: string;
  pickupTime: string;
};
export type SuggestResult =
  | { offered: false; needed: number }
  | {
      offered: true;
      groups: Suggestion[];
      leftOut: { retailerId: string; retailerName: string }[];
    };
