import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/server/site-url";

// /sitemap.xml (BUILD F-3, FR-24): the public pages only.
export default function sitemap(): MetadataRoute.Sitemap {
  const site = getSiteUrl();
  return ["/", "/privacy", "/terms"].map((path) => ({
    url: `${site}${path === "/" ? "" : path}`,
  }));
}
