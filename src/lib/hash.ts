import { createHash, randomBytes } from "node:crypto";

/** JSON con las llaves ordenadas: el mismo contenido siempre da el mismo hash. */
export function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJSON(obj[k])}`).join(",")}}`;
}

export const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

/** Token de 32 bytes para los links públicos (imposible de adivinar). */
export const newShareToken = () => randomBytes(32).toString("base64url");
