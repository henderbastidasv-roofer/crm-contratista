// Plantillas de correo con campos automáticos. Se guardan por compañía y se pueden editar.

export const MERGE_FIELDS = {
  nombre: "Primer nombre del cliente",
  nombre_completo: "Nombre completo",
  nombre_cliente: "Nombre completo (igual que nombre_completo)",
  direccion: "Dirección de la propiedad",
  fecha_cita: "Fecha de la cita",
  hora_cita: "Hora de la cita",
  tipo_cita: "Tipo de cita",
  tipo_trabajo: "Tipo de trabajo (seguro, retail, reparación…)",
  compania: "Nombre de la compañía",
  telefono_compania: "Teléfono de la compañía",
  correo_compania: "Correo de la compañía",
} as const;
export type MergeField = keyof typeof MERGE_FIELDS;
export type MergeData = Partial<Record<MergeField, string | null | undefined>>;

/**
 * Reemplaza {{campo}} o {campo} por su valor. Un campo conocido sin valor queda vacío
 * (nunca le llega "{{...}}" al cliente); lo que no es un campo se deja como está.
 */
export function fillTemplate(text: string, data: MergeData) {
  const value = (k: string) => {
    const key = k.toLowerCase() as MergeField;
    if (key === "nombre_cliente") return data.nombre_cliente ?? data.nombre_completo ?? "";
    return data[key] ?? "";
  };
  return text
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k: string) => (k.toLowerCase() in MERGE_FIELDS ? value(k).toString() : `{{${k}}}`))
    .replace(/(?<!\{)\{\s*([a-z_]+)\s*\}(?!\})/gi, (m, k: string) => (k.toLowerCase() in MERGE_FIELDS ? value(k).toString() : m));
}

export const TEMPLATE_KEYS = [
  "welcome",
  "inspection_confirmation",
  "repair_confirmation",
  "replacement_confirmation",
  "closing_confirmation",
  "appointment_reminder",
  "proposal",
  "invoice",
  "roof_replacement_info",
  "seasonal_promo",
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

/** Plantillas iniciales (en inglés, como los demás correos al cliente). Se pueden editar en Comunicaciones. */
export const DEFAULT_TEMPLATES: Record<TemplateKey, { name: string; subject: string; body: string }> = {
  welcome: {
    name: "Bienvenida",
    subject: "Welcome to {{compania}}, {{nombre}}!",
    body: `Hi {{nombre}},

Thank you for choosing {{compania}}. We're glad to help with your roof at {{direccion}}.

From here on, you'll hear from us at every step: inspection, estimate, insurance and installation. If you have any question, just reply to this email or call us at {{telefono_compania}}.

Thank you,
{{compania}}`,
  },
  inspection_confirmation: {
    name: "Confirmación de inspección",
    subject: "Your roof inspection is confirmed for {{fecha_cita}}",
    body: `Hi {{nombre}},

This is to confirm your free roof inspection:

Date: {{fecha_cita}}
Time: {{hora_cita}}
Address: {{direccion}}

Our inspector will check the roof, take photos and explain what we find. You don't need to be on the roof; just make sure we can get to the backyard if needed.

Need to change the time? Call us at {{telefono_compania}} or reply to this email.

Thank you,
{{compania}}`,
  },
  repair_confirmation: {
    name: "Confirmación de reparación",
    subject: "Your roof repair is scheduled for {{fecha_cita}}",
    body: `Hi {{nombre}},

This is to confirm your roof repair with {{compania}}:

Date: {{fecha_cita}}
Time: {{hora_cita}}
Address: {{direccion}}

Our crew will arrive in the time window above. Please make sure we can reach the area of the repair (gate open, pets inside).

Need to change the date? Call us at {{telefono_compania}} or reply to this email.

Thank you,
{{compania}}`,
  },
  replacement_confirmation: {
    name: "Confirmación de reemplazo de techo",
    subject: "Your roof replacement is scheduled for {{fecha_cita}}",
    body: `Hi {{nombre}},

Great news: your new roof is scheduled!

Date: {{fecha_cita}}
Start time: {{hora_cita}}
Address: {{direccion}}

Before installation day:
- Please move cars out of the driveway and garage area.
- Take fragile items off the walls and shelves inside.
- Keep pets and kids away from the work area.

Most roofs are done in one day. We clean up with a magnetic nail sweeper before we leave.

Any question, call us at {{telefono_compania}}.

Thank you,
{{compania}}`,
  },
  closing_confirmation: {
    name: "Confirmación de cita de cierre",
    subject: "See you on {{fecha_cita}} to review your roof proposal",
    body: `Hi {{nombre}},

This is to confirm our meeting to review your roof proposal and answer any question:

Date: {{fecha_cita}}
Time: {{hora_cita}}
Address: {{direccion}}

If anyone else needs to be part of the decision, please invite them. Need a different time? Call us at {{telefono_compania}}.

Thank you,
{{compania}}`,
  },
  appointment_reminder: {
    name: "Recordatorio de cita",
    subject: "Reminder: {{tipo_cita}} tomorrow at {{hora_cita}}",
    body: `Hi {{nombre}},

Just a friendly reminder of your appointment with {{compania}}:

{{tipo_cita}}
{{fecha_cita}} at {{hora_cita}}
{{direccion}}

If you need to reschedule, call us at {{telefono_compania}}.

See you soon,
{{compania}}`,
  },
  proposal: {
    name: "Propuesta",
    subject: "Your roofing proposal from {{compania}}",
    body: `Hi {{nombre}},

Your roofing proposal for {{direccion}} is ready. You can review the options and sign online from the link we sent you.

If you have any question about the options, call us at {{telefono_compania}}.

Thank you,
{{compania}}`,
  },
  invoice: {
    name: "Factura",
    subject: "Your invoice from {{compania}}",
    body: `Hi {{nombre}},

Your invoice for the work at {{direccion}} is ready. You can view it and pay online from the link we sent you.

Thank you for your business,
{{compania}}`,
  },
  roof_replacement_info: {
    name: "Información del reemplazo de techo",
    subject: "What to expect on your roof replacement day",
    body: `Hi {{nombre}},

Here is what to expect for your roof replacement at {{direccion}}:

- Our crew arrives early in the morning. Most roofs are done in one day.
- Please move cars out of the driveway and take fragile items off the walls inside.
- It will be noisy while we tear off the old roof.
- We protect your landscaping and clean up with a magnetic sweeper for nails.

Any question, call us at {{telefono_compania}}.

Thank you,
{{compania}}`,
  },
  seasonal_promo: {
    name: "Promoción de temporada (Navidad)",
    subject: "A Christmas special from {{compania}}",
    body: `Hi {{nombre}},

Happy holidays from all of us at {{compania}}!

This December we're offering a free roof check-up before the winter storms. If you've noticed leaks, missing shingles or damage from the last storms, this is the time to have it looked at.

Reply to this email or call {{telefono_compania}} to book your visit.

Merry Christmas,
{{compania}}`,
  },
};

export const AUTOMATIONS = {
  inspection_confirmation: {
    label: "Confirmación al agendar una inspección",
    help: "Cuando se crea una inspección en el Calendario con un cliente que tiene correo, se prepara la confirmación.",
    template: "inspection_confirmation" as TemplateKey,
  },
  repair_confirmation: {
    label: "Confirmación al agendar una reparación",
    help: "Cuando se crea una reparación en el Calendario con un cliente que tiene correo, se prepara la confirmación.",
    template: "repair_confirmation" as TemplateKey,
  },
  replacement_confirmation: {
    label: "Confirmación al agendar un reemplazo de techo",
    help: "Cuando se crea un reemplazo de techo en el Calendario con un cliente que tiene correo, se prepara la confirmación.",
    template: "replacement_confirmation" as TemplateKey,
  },
  closing_confirmation: {
    label: "Confirmación al agendar una cita de cierre",
    help: "Cuando se crea una cita de cierre en el Calendario con un cliente que tiene correo, se prepara la confirmación.",
    template: "closing_confirmation" as TemplateKey,
  },
  appointment_reminder: {
    label: "Recordatorio un día antes de la cita",
    help: "Cada mañana se preparan los recordatorios de las citas del día siguiente.",
    template: "appointment_reminder" as TemplateKey,
  },
} as const;
export type AutomationKey = keyof typeof AUTOMATIONS;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Texto plano → párrafos HTML (con links clicables). */
export function textToHtml(text: string) {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#1e293b">${esc(p).replace(/\n/g, "<br>").replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#1f6bff">$1</a>')}</p>`)
    .join("");
}
