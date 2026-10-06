import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/server/site-url";

// /robots.txt (BUILD F-3, FR-24): indexable only in production; previews and local never.
export default function robots(): MetadataRoute.Robots {
  if (process.env.VERCEL_ENV !== "production")
    return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/settings", "/auth/", "/account/"],
    },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
