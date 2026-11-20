// Nombre de la compañía y del CRM. Se ponen en la instalación (.env.local y en Vercel):
//   NEXT_PUBLIC_COMPANY_NAME="Techos Ejemplo LLC"
//   NEXT_PUBLIC_APP_NAME="Techos Ejemplo CRM"   (opcional; si no, "<compañía> CRM")
// Lo demás de la marca (logo, color, teléfono, dirección) se guarda adentro del CRM, en Marca.
export const COMPANY_NAME = process.env.NEXT_PUBLIC_COMPANY_NAME?.trim() || "Mi compañía";
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME?.trim() || `${COMPANY_NAME} CRM`;

// Zona horaria de la compañía (citas, fechas de firma y correos). Ej. America/New_York, America/Denver, America/Los_Angeles.
export const TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE?.trim() || "America/Chicago";
