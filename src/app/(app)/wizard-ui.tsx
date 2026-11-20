"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

// Piezas comunes de los asistentes paso a paso (propuestas, facturas y contratos).

/** Formulario que se guarda solo al cambiar algo (borrador), sin moverse de paso. */
export function AutoSaveForm({ action, children, className, id }: { action: (f: FormData) => Promise<void>; children: React.ReactNode; className?: string; id?: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [, start] = useTransition();
  const save = () => {
    if (!ref.current) return;
    const fd = new FormData(ref.current);
    setState("saving");
    start(async () => {
      await action(fd);
      setState("saved");
    });
  };
  return (
    <form
      ref={ref}
      id={id}
      action={action}
      className={className}
      onChange={(e) => {
        if ((e.target as HTMLElement).dataset.nosave !== undefined) return;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(save, (e.target as unknown as HTMLInputElement).type === "radio" ? 0 : 700);
      }}
    >
      {children}
      <SavedTag state={state} />
    </form>
  );
}

function SavedTag({ state }: { state: "idle" | "saving" | "saved" }) {
  if (state === "idle") return null;
  return <span className="sr-only" aria-live="polite">{state === "saving" ? "Guardando" : "Guardado"}</span>;
}

/** Botón "Siguiente" del pie: guarda el paso y avanza; se bloquea mientras procesa. */
export function NextButton({ label = "Siguiente", go, form }: { label?: string; go: number; form?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary min-h-11 px-6" name="go" value={go} form={form} disabled={pending}>
      {pending ? "Guardando…" : label}
    </button>
  );
}

/** Paso 2: tarjetas grandes; al tocar una se marca y se guarda. */
export function ChoiceCard({ name, value, checked, title, text, badge }: { name: string; value: string; checked: boolean; title: string; text: string; badge?: string }) {
  return (
    <label className="card block cursor-pointer p-5 transition has-[:checked]:border-2 has-[:checked]:border-navy has-[:checked]:shadow-[0_0_0_4px_rgba(31,107,255,0.12)]">
      <span className="flex items-center gap-2">
        <input type="radio" name={name} value={value} defaultChecked={checked} className="h-5 w-5 accent-navy" />
        {badge && <span className="badge bg-navy-tint text-navy">{badge}</span>}
      </span>
      <span className="mt-2 block text-[19px] font-extrabold tracking-[-0.02em] text-ink">{title}</span>
      <span className="mt-0.5 block text-sm text-muted">{text}</span>
    </label>
  );
}

/** Vista previa: la vista del cliente en tamaño computadora o celular. */
export function PreviewFrame({ src }: { src: string }) {
  const [phone, setPhone] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setScale(Math.min(1, e.contentRect.width / 1280)));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="space-y-3">
      <div className="inline-flex gap-1 rounded-full bg-sunk p-1 text-sm font-bold">
        {[false, true].map((p) => (
          <button key={String(p)} type="button" onClick={() => setPhone(p)} className={`rounded-full px-4 py-1.5 ${phone === p ? "bg-white text-navy shadow" : "text-muted"}`}>
            {p ? "Celular" : "Computadora"}
          </button>
        ))}
      </div>
      <div ref={box} className={`overflow-hidden rounded-2xl border border-line bg-white ${phone ? "mx-auto w-[390px] max-w-full" : "w-full"}`} style={phone ? undefined : { height: `${Math.round(900 * scale)}px` }}>
        {phone ? (
          <iframe src={src} title="Vista previa de la propuesta en celular" className="h-[75vh] w-full" />
        ) : (
          <iframe
            src={src}
            title="Vista previa de la propuesta en computadora"
            style={{ width: 1280, height: 900, transform: `scale(${scale})`, transformOrigin: "0 0" }}
          />
        )}
      </div>
    </div>
  );
}

/** Último paso: el envío solo se habilita después de marcar "Revisé…". */
export function ReviewGate({ children, label = "Revisé los precios, los documentos y la vista previa" }: { children: React.ReactNode; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="space-y-4">
      <label className="card flex cursor-pointer items-center gap-3 p-4 text-[15px] font-semibold">
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="h-5 w-5 accent-navy" />
        {label}
      </label>
      <div className={ok ? "" : "pointer-events-none opacity-40"} aria-disabled={!ok}>
        {children}
      </div>
    </div>
  );
}

/** Tarjeta que es un botón de formulario (ej. elegir plantilla): se bloquea mientras crea, para no duplicar. */
export function CardButton({ children, className, pressed }: { children: React.ReactNode; className?: string; pressed?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className={`${className ?? ""} ${pending ? "opacity-60" : ""}`} aria-pressed={pressed} disabled={pending}>
      {children}
      {pending && <span className="mt-2 block text-xs font-bold text-navy">Abriendo…</span>}
    </button>
  );
}
