import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // CRM con sesión: todas las páginas dependen del usuario, no hay nada que prerenderizar.
  poweredByHeader: false,
  // Los CSV de importación (Roofr) viajan en una Server Action; el límite por defecto es 1 MB.
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
