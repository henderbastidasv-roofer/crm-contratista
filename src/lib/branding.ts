import type { SupabaseClient } from "@supabase/supabase-js";

export const BRANDING_BUCKET = "branding";

/** URL pública de un archivo del bucket de marca (logos, badges, brochures). */
export function publicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BRANDING_BUCKET}/${encoded}`;
}

export const isHexColor = (c: string) => /^#[0-9a-f]{6}$/i.test(c);

/** Texto (una frase por línea) → lista limpia. */
export const linesToList = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•*\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 12);

export type Branding = {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  license_number: string | null;
  website: string | null;
  tagline: string | null;
  about: string | null;
  why_us: string[];
  accent_color: string;
  logo_url: string | null;
  cover_url: string | null;
  badges: { id: string; label: string; url: string }[];
  documents: { id: string; title: string; kind: string; url: string; show_on_all: boolean }[];
};

export async function loadBranding(db: SupabaseClient, companyId: string): Promise<Branding | null> {
  const [{ data: c }, { data: badges }, { data: docs }] = await Promise.all([
    db
      .from("companies")
      .select("name, phone, email, address, license_number, website, tagline, about, why_us, accent_color, logo_path, cover_path")
      .eq("id", companyId)
      .maybeSingle(),
    db.from("company_badges").select("id, label, image_path").eq("company_id", companyId).order("position").order("created_at"),
    db.from("company_documents").select("id, title, kind, file_path, show_on_all").eq("company_id", companyId).order("position").order("created_at"),
  ]);
  if (!c) return null;
  return {
    ...c,
    why_us: Array.isArray(c.why_us) ? c.why_us : [],
    accent_color: isHexColor(c.accent_color ?? "") ? c.accent_color : "#1d4a63",
    logo_url: publicUrl(c.logo_path),
    cover_url: publicUrl(c.cover_path),
    badges: (badges ?? []).map((b) => ({ id: b.id, label: b.label, url: publicUrl(b.image_path)! })),
    documents: (docs ?? []).map((d) => ({ id: d.id, title: d.title, kind: d.kind, url: publicUrl(d.file_path)!, show_on_all: d.show_on_all })),
  };
}
