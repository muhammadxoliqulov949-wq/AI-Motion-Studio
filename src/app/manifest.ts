import type { MetadataRoute } from "next";

/** Web app manifest: lets phones (and desktop Chrome/Edge) install the site as an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AI Motion Studio",
    short_name: "Motion Studio",
    description: "AI bilan video montaj: CapCut uslubidagi editor, musiqa, subtitr va effektlar.",
    lang: "uz",
    start_url: "/editor",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0a0a0c",
    theme_color: "#0a0a0c",
    categories: ["photo", "video", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Editor", url: "/editor" },
      { name: "AI Montaj", url: "/montage" },
    ],
  };
}
