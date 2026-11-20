// Seguro y medidas de cada trabajo (compartido entre el servidor y la pantalla).

export const LOSS_TYPES = { wind: "Viento", hail: "Granizo", other: "Otro" } as const;
export type LossType = keyof typeof LOSS_TYPES;
export const isLossType = (v: string): v is LossType => v in LOSS_TYPES;

export const MEASUREMENT_STATUS = { not_ordered: "No ordenadas", ordered: "Ordenadas", ready: "Listas" } as const;
export type MeasurementStatus = keyof typeof MEASUREMENT_STATUS;
export const isMeasurementStatus = (v: string): v is MeasurementStatus => v in MEASUREMENT_STATUS;

export const MEASUREMENT_STYLE: Record<MeasurementStatus, string> = {
  not_ordered: "bg-sunk text-muted",
  ordered: "bg-warn-tint text-warn",
  ready: "bg-ok-tint text-ok",
};

/**
 * Proveedores de medidas. Hoy todos funcionan subiendo el PDF a mano.
 * `api: true` quedará cuando se conecte su API (pedir el reporte y recibirlo solo):
 * para eso el trabajo ya guarda measurements_provider, measurements_ordered_at y measurements_external_id.
 */
export const MEASUREMENT_PROVIDERS = {
  manual: { label: "Manual / otro", api: false },
  eagleview: { label: "EagleView", api: false },
  hover: { label: "Hover", api: false },
  gaf_quickmeasure: { label: "GAF QuickMeasure", api: false },
  roofr: { label: "Roofr", api: false },
  roofsnap: { label: "RoofSnap", api: false },
} as const;
export type MeasurementProvider = keyof typeof MEASUREMENT_PROVIDERS;
