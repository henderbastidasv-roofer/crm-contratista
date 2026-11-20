// Fotos del trabajo: constantes y tipos compartidos entre servidor y navegador.

export const PHOTOS_BUCKET = "photos";

/** Lado largo máximo de la foto guardada (≈1 MB en JPEG). Suficiente para reportes y ajustadores. */
export const PHOTO_MAX_EDGE = 2560;
export const THUMB_MAX_EDGE = 480;

/** Etiquetas de siempre (las típicas de un trabajo de techo); se pueden escribir otras. */
export const DEFAULT_TAGS = [
  "Front",
  "Back",
  "Left",
  "Right",
  "North",
  "South",
  "East",
  "West",
  "Before",
  "After",
  "Damage",
  "Start",
  "Finished",
  "Materials",
  "Interior",
  "Receipt",
] as const;

/** Rutas dentro del bucket: <company>/<job>/<photo>.jpg y sus variantes. */
export const photoPaths = (companyId: string, jobId: string, photoId: string) => ({
  full: `${companyId}/${jobId}/${photoId}.jpg`,
  thumb: `${companyId}/${jobId}/${photoId}_t.jpg`,
  annotated: `${companyId}/${jobId}/${photoId}_a.jpg`,
  annotatedThumb: `${companyId}/${jobId}/${photoId}_at.jpg`,
});

export type PhotoRow = {
  id: string;
  job_id: string;
  storage_path: string | null;
  thumb_path: string | null;
  annotated_path: string | null;
  annotated_thumb_path: string | null;
  description: string | null;
  tags: string[];
  is_cover: boolean;
  taken_at: string | null;
  created_at: string;
  lat: number | null;
  lng: number | null;
  width: number | null;
  height: number | null;
  source: string;
  created_by: string | null;
};

/** Foto lista para mostrar: con links firmados (vencen) a la miniatura y a la foto grande. */
export type PhotoView = PhotoRow & { thumbUrl: string | null; fullUrl: string | null; originalUrl: string | null };

export const PHOTO_COLUMNS =
  "id, job_id, storage_path, thumb_path, annotated_path, annotated_thumb_path, description, tags, is_cover, taken_at, created_at, lat, lng, width, height, source, created_by";
