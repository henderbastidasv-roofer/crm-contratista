import type { MetadataRoute } from "next";
import { APP_NAME, COMPANY_NAME } from "@/lib/brand";

// Para instalar el CRM en la pantalla de inicio del teléfono (iPhone: Compartir → Agregar a inicio).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: `CRM de ${COMPANY_NAME}: trabajos, fotos, propuestas e invoices.`,
    start_url: "/",
    display: "standalone",
    background_color: "#f3f7fe",
    theme_color: "#1f6bff",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
