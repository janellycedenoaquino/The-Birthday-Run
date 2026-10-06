import type { MetadataRoute } from "next";
import { appConfig } from "@/config/app";

// /manifest.webmanifest (BUILD F-3, FR-25): installable, from the config file.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: appConfig.name,
    short_name: appConfig.shortName,
    description: appConfig.description,
    start_url: "/",
    display: "standalone",
    theme_color: appConfig.brand.primary,
    background_color: "white",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png" },
    ],
  };
}
