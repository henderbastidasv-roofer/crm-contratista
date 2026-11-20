// Contratos: plantillas iniciales, estados y el texto que acepta el cliente al firmar.
// Las plantillas son un punto de partida: cada compañía debe revisarlas con su abogado antes de usarlas en serio.

export const CONTRACT_STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviado",
  viewed: "Visto",
  signed: "Firmado",
  void: "Anulado",
};
export const CONTRACT_STATUS_STYLE: Record<string, string> = {
  draft: "bg-sunk text-muted",
  sent: "bg-navy-tint text-navy",
  viewed: "bg-warn-tint text-warn",
  signed: "bg-ok-tint text-ok",
  void: "bg-sunk text-faint",
};

export const CONTRACT_CONSENT =
  "I agree to use electronic records and signatures. By typing my name and clicking “Sign”, I intend to sign this document and I agree to its terms. I understand I can download a copy of the signed document.";

export const CONTRACT_FIELDS = {
  nombre_completo: "Nombre del cliente",
  direccion: "Dirección de la propiedad",
  fecha: "Fecha de hoy",
  valor_trabajo: "Valor del trabajo",
  aseguradora: "Compañía de seguro",
  numero_reclamo: "Número de reclamo",
  compania: "Tu compañía",
  direccion_compania: "Dirección de tu compañía",
  telefono_compania: "Teléfono de tu compañía",
  licencia: "Número de licencia",
  fecha_contrato: "Fecha del contrato (cuando firmó la propuesta)",
  fecha_terminacion: "Fecha de terminación (hoy)",
} as const;
export type ContractData = Partial<Record<keyof typeof CONTRACT_FIELDS, string | null>>;

export function fillContract(text: string, data: ContractData) {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k: string) => (data[k.toLowerCase() as keyof ContractData] ?? "_______________").toString());
}

// El certificado de terminación con diseño (PDF) reemplaza a la versión de texto; la de texto queda para otras compañías.
export const CONTRACT_TEMPLATE_KEYS = ["customer_contract", "subcontractor"] as const;

export const DEFAULT_CONTRACT_TEMPLATES: Record<(typeof CONTRACT_TEMPLATE_KEYS)[number] | "completion", { name: string; body: string }> = {
  customer_contract: {
    name: "Contrato con el cliente",
    body: `ROOFING AGREEMENT

This agreement is made on {{fecha}} between {{compania}} ("Contractor"), {{direccion_compania}}, and {{nombre_completo}} ("Owner"), for the property at {{direccion}}.

1. SCOPE OF WORK
Contractor will remove the existing roof and install a new roof system as described in the accepted proposal, including underlayment, flashing, ventilation and clean-up of the work area.

2. PRICE AND PAYMENT
The contract price is {{valor_trabajo}}. For insurance claims, the price follows the approved insurance scope, plus any supplements approved by the insurance company. Final payment is due when the work is completed.

3. INSURANCE CLAIM
Insurance company: {{aseguradora}} · Claim number: {{numero_reclamo}}.
Texas law requires the insured to pay any deductible. Contractor will not waive, absorb or rebate the deductible (Texas Business & Commerce Code §27.02).

4. SCHEDULE
Contractor will schedule the installation once materials are available and weather allows. Owner will provide access to the property and the driveway on installation day.

5. WARRANTY
Manufacturer warranty according to the selected roof system. Contractor workmanship warranty as stated in the proposal.

6. CHANGES
Any change to the scope or price must be agreed in writing (email or signed change order).

Contractor: {{compania}} · {{telefono_compania}} · License {{licencia}}`,
  },
  subcontractor: {
    name: "Contrato de subcontratista",
    body: `SUBCONTRACTOR AGREEMENT

Date: {{fecha}}
Contractor: {{compania}}, {{direccion_compania}}
Project address: {{direccion}}
Subcontractor: {{nombre_completo}}

1. WORK
Subcontractor will perform the roofing work assigned by Contractor for the project above, following the manufacturer's installation instructions and local building code.

2. PAYMENT
Contractor will pay {{valor_trabajo}} for the completed work, after inspection and approval by Contractor.

3. INSURANCE AND SAFETY
Subcontractor keeps current general liability insurance and follows OSHA safety rules, including fall protection. Subcontractor is responsible for its own crew, tools and taxes.

4. QUALITY AND CLEAN-UP
Subcontractor will leave the property clean every day, including nails (magnetic sweep), and will correct any workmanship issue at no extra cost.

5. INDEPENDENT CONTRACTOR
Subcontractor is an independent contractor, not an employee of Contractor.

Contractor: {{compania}} · {{telefono_compania}}`,
  },
  completion: {
    name: "Certificado de terminación",
    body: `CERTIFICATE OF COMPLETION

Property: {{direccion}}
Owner: {{nombre_completo}}
Contractor: {{compania}}
Insurance company: {{aseguradora}} · Claim number: {{numero_reclamo}}

I confirm that {{compania}} has completed the roofing work at the property above, that the work was done to my satisfaction and that the property was left clean.

I authorize the release of any recoverable depreciation and final payment to the contractor and/or to me as named on the insurance claim.

Date: {{fecha}}`,
  },
};
