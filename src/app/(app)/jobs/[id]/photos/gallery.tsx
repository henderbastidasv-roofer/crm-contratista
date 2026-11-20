"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { DEFAULT_TAGS, type PhotoView } from "@/lib/photos";
import { enqueuePhoto, processImage } from "@/lib/photo-queue";
import { UploadStatus } from "@/components/upload-status";
import { deletePhotos, setCover, sharePhotos, tagPhotos, updatePhoto } from "./actions";
import { Markup } from "./markup";
import { COMPANY_NAME, TIME_ZONE } from "@/lib/brand";

const fmt = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("es-US", { dateStyle: "medium", timeStyle: "short", timeZone: TIME_ZONE }).format(new Date(iso))
    : "—";

export function Gallery({
  jobId,
  companyId,
  userId,
  photos,
  names,
}: {
  jobId: string;
  companyId: string;
  userId: string;
  photos: PhotoView[];
  names: Record<string, string>;
}) {
  const [filter, setFilter] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [importing, setImporting] = useState(0);
  const [pending, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of photos) for (const t of p.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [photos]);
  const shown = filter ? photos.filter((p) => p.tags.includes(filter)) : photos;
  const current = open ? shown.find((p) => p.id === open) ?? photos.find((p) => p.id === open) ?? null : null;

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const ids = selecting && selected.length ? selected : null;
  const reportHref = `/report/photos/${jobId}${ids ? `?ids=${ids.join(",")}` : filter ? `?tag=${encodeURIComponent(filter)}` : ""}`;

  const importFiles = async (files: File[]) => {
    setImporting(files.length);
    for (const f of files) {
      try {
        const img = await processImage(f);
        await enqueuePhoto({
          id: crypto.randomUUID(),
          companyId,
          jobId,
          userId,
          ...img,
          takenAt: new Date(f.lastModified || Date.now()).toISOString(),
          lat: null,
          lng: null,
          accuracy: null,
          tags: filter ? [filter] : [],
          description: null,
          source: "upload",
        });
      } catch {
        alert(`No se pudo leer "${f.name}". Prueba con una foto JPG o PNG.`);
      }
      setImporting((n) => n - 1);
    }
  };

  return (
    <div className="space-y-4">
      {/* Acciones */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/camera/${jobId}`} className="btn-primary">
          📷 Tomar fotos
        </Link>
        <button className="btn-navy" onClick={() => fileInput.current?.click()} disabled={importing > 0}>
          {importing > 0 ? `Preparando ${importing}…` : "Subir de la galería"}
        </button>
        <UploadStatus />
        <div className="ml-auto flex flex-wrap gap-2">
          {photos.length > 0 && (
            <>
              <button
                className="btn-ghost"
                disabled={pending || (selecting && !selected.length)}
                onClick={() => start(async () => setShareUrl(await sharePhotos(jobId, ids)))}
              >
                {selecting ? `Compartir ${selected.length || ""}` : "Compartir todas"}
              </button>
              <a className="btn-ghost" href={reportHref} target="_blank" rel="noreferrer">
                Reporte PDF{selecting && selected.length ? ` (${selected.length})` : ""}
              </a>
              <button
                className={selecting ? "btn-navy" : "btn-ghost"}
                onClick={() => {
                  setSelecting(!selecting);
                  setSelected([]);
                }}
              >
                {selecting ? "Listo" : "Seleccionar"}
              </button>
            </>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            void importFiles(files);
          }}
        />
      </div>

      {shareUrl && <ShareBox url={shareUrl} onClose={() => setShareUrl(null)} />}

      {selecting && selected.length > 0 && (
        <div className="card flex flex-wrap items-center gap-2 px-4 py-3">
          <span className="mr-2 text-sm font-bold text-ink">{selected.length} seleccionada{selected.length === 1 ? "" : "s"}</span>
          <select
            className="input min-h-9 w-auto py-1 text-sm"
            value=""
            onChange={(e) => {
              const t = e.target.value;
              if (t) start(() => tagPhotos(jobId, selected, t));
            }}
          >
            <option value="">Poner etiqueta…</option>
            {DEFAULT_TAGS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <button className="btn-ghost min-h-9" onClick={() => setSelected(shown.map((p) => p.id))}>
            Todas
          </button>
          <button
            className="btn-ghost min-h-9 text-brand hover:border-brand hover:text-brand"
            onClick={() => {
              if (confirm(`¿Borrar ${selected.length} foto${selected.length === 1 ? "" : "s"}? No se puede deshacer.`))
                start(async () => {
                  await deletePhotos(jobId, selected);
                  setSelected([]);
                });
            }}
          >
            Borrar
          </button>
        </div>
      )}

      {/* Filtro por etiqueta */}
      {tagCounts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Chip active={!filter} onClick={() => setFilter(null)}>
            Todas · {photos.length}
          </Chip>
          {tagCounts.map(([t, n]) => (
            <Chip key={t} active={filter === t} onClick={() => setFilter(filter === t ? null : t)}>
              {t} · {n}
            </Chip>
          ))}
        </div>
      )}

      {photos.length === 0 ? (
        <div className="card grid place-items-center px-6 py-16 text-center">
          <div className="text-4xl">📷</div>
          <h2 className="section-title mt-3">Todavía no hay fotos</h2>
          <p className="mt-1 max-w-sm text-sm text-muted">
            Tómalas con la cámara del CRM: suben solas a la nube y no se guardan en la galería de tu teléfono.
          </p>
          <Link href={`/camera/${jobId}`} className="btn-primary mt-5">
            Abrir cámara
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2 lg:grid-cols-6">
          {shown.map((p) => {
            const isSel = selected.includes(p.id);
            return (
              <button
                key={p.id}
                onClick={() => (selecting ? toggle(p.id) : setOpen(p.id))}
                className={`group relative aspect-square overflow-hidden rounded-xl bg-sunk ${isSel ? "ring-4 ring-navy" : ""}`}
              >
                {p.thumbUrl && <img src={p.thumbUrl} alt={p.description ?? ""} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.03]" />}
                {p.is_cover && <span className="absolute left-1.5 top-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-extrabold text-navy">★ Portada</span>}
                {p.annotated_path && !selecting && <span className="absolute right-1.5 top-1.5 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-extrabold text-white">✎</span>}
                {(p.tags.length > 0 || p.description) && (
                  <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-5 text-left text-[11px] font-bold text-white">
                    {p.tags.join(" · ") || p.description}
                  </span>
                )}
                {selecting && (
                  <span className={`absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full border-2 border-white text-xs font-black ${isSel ? "bg-navy text-white" : "bg-black/30"}`}>
                    {isSel ? "✓" : ""}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {current && (
        <Lightbox
          key={current.id}
          photo={current}
          list={shown}
          jobId={jobId}
          companyId={companyId}
          author={current.created_by ? names[current.created_by] : undefined}
          onNavigate={setOpen}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-[13px] font-bold transition ${active ? "bg-navy text-white" : "border border-line bg-white text-muted hover:border-navy/40 hover:text-navy"}`}
    >
      {children}
    </button>
  );
}

function ShareBox({ url, onClose }: { url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `Here are the photos of your roof from ${COMPANY_NAME}: ${url}`;
  return (
    <div className="card space-y-2 p-4">
      <div className="flex items-center justify-between">
        <h3 className="section-title text-[17px]">Link de fotos listo</h3>
        <button onClick={onClose} className="text-sm font-bold text-faint hover:text-ink">
          Cerrar
        </button>
      </div>
      <input readOnly value={url} className="input text-xs" onFocus={(e) => e.target.select()} />
      <div className="flex flex-wrap gap-2">
        <button
          className="btn-primary"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          }}
        >
          {copied ? "Copiado ✓" : "Copiar link"}
        </button>
        <a className="btn-ghost" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(text)}`}>
          WhatsApp
        </a>
        <a className="btn-ghost" href={`sms:?&body=${encodeURIComponent(text)}`}>
          SMS
        </a>
      </div>
      <p className="text-xs text-muted">Sirve para el cliente o el ajustador. Cuando lo abran te llega un aviso.</p>
    </div>
  );
}

function Lightbox({
  photo,
  list,
  jobId,
  companyId,
  author,
  onNavigate,
  onClose,
}: {
  photo: PhotoView;
  list: PhotoView[];
  jobId: string;
  companyId: string;
  author?: string;
  onNavigate: (id: string) => void;
  onClose: () => void;
}) {
  const [desc, setDesc] = useState(photo.description ?? "");
  const [tags, setTags] = useState(photo.tags);
  const [custom, setCustom] = useState("");
  const [marking, setMarking] = useState(false);
  const [pending, start] = useTransition();
  const i = list.findIndex((p) => p.id === photo.id);
  const prev = i > 0 ? list[i - 1] : null;
  const next = i >= 0 && i < list.length - 1 ? list[i + 1] : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA" || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && prev) onNavigate(prev.id);
      if (e.key === "ArrowRight" && next) onNavigate(next.id);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [prev, next, onClose, onNavigate]);

  const saveTags = (t: string[]) => {
    setTags(t);
    start(() => updatePhoto(jobId, photo.id, { tags: t }));
  };
  const allTags = [...new Set([...DEFAULT_TAGS, ...tags])];

  if (marking) return <Markup photo={photo} jobId={jobId} companyId={companyId} onClose={() => setMarking(false)} />;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b1526]/95 text-white lg:flex-row">
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-2 sm:p-6">
        {photo.fullUrl && <img src={photo.fullUrl} alt={photo.description ?? ""} className="max-h-full max-w-full rounded-lg object-contain" />}
        <button onClick={onClose} className="absolute left-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-lg font-bold" aria-label="Cerrar">
          ✕
        </button>
        <span className="absolute right-3 top-4 rounded-full bg-white/15 px-3 py-1 text-[12px] font-bold">
          {i + 1} / {list.length}
        </span>
        {prev && (
          <button onClick={() => onNavigate(prev.id)} className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-xl" aria-label="Anterior">
            ‹
          </button>
        )}
        {next && (
          <button onClick={() => onNavigate(next.id)} className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-xl" aria-label="Siguiente">
            ›
          </button>
        )}
      </div>

      <aside className="max-h-[48vh] w-full shrink-0 space-y-4 overflow-y-auto bg-white p-5 text-ink lg:max-h-none lg:w-[360px]">
        <div className="text-[13px] text-muted">
          <div className="font-bold text-ink">{fmt(photo.taken_at ?? photo.created_at)}</div>
          {author && <div>Tomada por {author}</div>}
          {photo.lat != null && photo.lng != null && (
            <a className="font-semibold text-navy hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${photo.lat},${photo.lng}`}>
              Ver ubicación en el mapa
            </a>
          )}
        </div>

        <div>
          <label className="label" htmlFor="desc">Descripción</label>
          <textarea
            id="desc"
            rows={3}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={() => desc !== (photo.description ?? "") && start(() => updatePhoto(jobId, photo.id, { description: desc }))}
            placeholder="Ej. Hail damage on the north slope, ridge cap cracked."
            className="input"
          />
          <p className="mt-1 text-xs text-faint">{pending ? "Guardando…" : "Se guarda sola. Sale en el reporte del ajustador."}</p>
        </div>

        <div>
          <div className="label">Etiquetas</div>
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((t) => (
              <button
                key={t}
                onClick={() => saveTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t])}
                className={`rounded-full px-2.5 py-1 text-[12px] font-bold transition ${tags.includes(t) ? "bg-navy text-white" : "bg-sunk text-muted hover:text-navy"}`}
              >
                {t}
              </button>
            ))}
          </div>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (custom.trim()) saveTags([...tags, custom.trim()]);
              setCustom("");
            }}
          >
            <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Otra etiqueta…" className="input min-h-9 py-1 text-sm" />
            <button className="btn-ghost min-h-9">+</button>
          </form>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primary" onClick={() => setMarking(true)}>
            ✎ Marcar
          </button>
          <button className={photo.is_cover ? "btn-navy" : "btn-ghost"} onClick={() => start(() => setCover(jobId, photo.is_cover ? null : photo.id))}>
            {photo.is_cover ? "★ Es la portada" : "☆ Portada"}
          </button>
          {photo.originalUrl && (
            <a className="btn-ghost" href={photo.originalUrl} target="_blank" rel="noreferrer">
              Original
            </a>
          )}
          <button
            className="btn-ghost text-brand hover:border-brand hover:text-brand"
            onClick={() => {
              if (!confirm("¿Borrar esta foto? No se puede deshacer.")) return;
              const go = next?.id ?? prev?.id ?? null;
              start(async () => {
                await deletePhotos(jobId, [photo.id]);
                if (go) onNavigate(go);
                else onClose();
              });
            }}
          >
            Borrar
          </button>
        </div>
      </aside>
    </div>
  );
}
