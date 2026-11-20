// Estados de cada correo de Comunicaciones (los mismos en la lista, el historial y el perfil del cliente).
export const EMAIL_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  sent: "Enviado",
  failed: "Falló",
  rejected: "Rechazado",
};
export const EMAIL_STATUS_STYLE: Record<string, string> = {
  pending: "bg-warn-tint text-warn",
  approved: "bg-navy-tint text-navy",
  sent: "bg-ok-tint text-ok",
  failed: "bg-brand-tint text-brand",
  rejected: "bg-sunk text-muted",
};
