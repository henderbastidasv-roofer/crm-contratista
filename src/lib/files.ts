// Archivos de cada cliente (bucket privado "files").

export const FILES_BUCKET = "files";
export const MAX_FILE_MB = 50;

export const FILE_CATEGORIES = {
  xactimate: "Xactimate",
  measurements: "Medidas",
  insurance: "Seguro",
  contract: "Contrato",
  proposal: "Propuesta",
  invoice: "Invoice / recibo",
  photo: "Foto",
  other: "Otro",
} as const;
export type FileCategory = keyof typeof FILE_CATEGORIES;

export const isFileCategory = (v: string): v is FileCategory => v in FILE_CATEGORIES;

/** Categoría probable según el nombre del archivo (se puede cambiar antes de subir). */
export function guessCategory(name: string): FileCategory {
  const n = name.toLowerCase();
  if (/\.esx$|xactimate|final draft|estimate/.test(n)) return "xactimate";
  if (/eagle ?view|roofr|roofsnap|hover|measure|medida|report/.test(n)) return "measurements";
  if (/claim|policy|poliza|póliza|adjuster|declaration|carrier|insurance|seguro|depreciation/.test(n)) return "insurance";
  if (/contract|contrato|agreement|signed|firmad/.test(n)) return "contract";
  if (/invoice|receipt|recibo/.test(n)) return "invoice";
  if (/\.(jpe?g|png|heic|webp)$/.test(n)) return "photo";
  return "other";
}

/** Nombre seguro para la ruta en Storage, conservando la extensión. */
export function storageName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "").slice(-80) || "archivo";
}

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
