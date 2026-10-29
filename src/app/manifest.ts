import type { MetadataRoute } from "next";

// Lets the owner install the sales overview on the phone's home screen
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Books Plaza",
    short_name: "Books Plaza",
    description: "Sales, expenses and exhibitions at a glance",
    start_url: "/m",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#f97316",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
