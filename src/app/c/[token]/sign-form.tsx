"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { signContract, type ContractSignState } from "./actions";

/** Firmar: nombre, correo, firma dibujada con el dedo o el mouse (opcional) y aceptar. */
export function SignForm({ token, defaultName, defaultEmail, consent, accent }: { token: string; defaultName: string; defaultEmail: string; consent: string; accent: string }) {
  const [state, action, pending] = useActionState<ContractSignState, FormData>(signContract.bind(null, token), undefined);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState("");
  const drawn = useRef(false);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0b1526";
    let down = false;
    const pos = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top] as const;
    };
    const start = (e: PointerEvent) => {
      down = true;
      c.setPointerCapture(e.pointerId);
      const [x, y] = pos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    };
    const move = (e: PointerEvent) => {
      if (!down) return;
      const [x, y] = pos(e);
      ctx.lineTo(x, y);
      ctx.stroke();
      drawn.current = true;
    };
    const end = () => {
      if (!down) return;
      down = false;
      if (drawn.current) setDrawing(c.toDataURL("image/png"));
    };
    c.addEventListener("pointerdown", start);
    c.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    return () => {
      c.removeEventListener("pointerdown", start);
      c.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
  }, []);

  const clear = () => {
    const c = canvas.current;
    if (!c) return;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    drawn.current = false;
    setDrawing("");
  };

  if (state?.ok)
    return (
      <div className="rounded-2xl border border-ok/30 bg-ok-tint p-5 text-center">
        <div className="text-xl font-black text-ok">Signed — thank you!</div>
        <p className="mt-1 text-sm text-ok">Reload this page to download your signed copy.</p>
      </div>
    );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="signature" value={drawing} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="sg-name">Full name</label>
          <input id="sg-name" name="signer_name" required defaultValue={defaultName} autoComplete="name" className="input min-h-12 text-base" />
        </div>
        <div>
          <label className="label" htmlFor="sg-email">Email</label>
          <input id="sg-email" name="signer_email" type="email" defaultValue={defaultEmail} autoComplete="email" className="input min-h-12 text-base" />
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between">
          <span className="label">Draw your signature (optional)</span>
          <button type="button" onClick={clear} className="text-xs font-semibold text-muted hover:text-ink">Clear</button>
        </div>
        <canvas ref={canvas} className="h-36 w-full touch-none rounded-xl border border-dashed border-line bg-white" aria-label="Signature pad" />
        <p className="mt-1 text-xs text-muted">If you don&apos;t draw it, your typed name is used as your signature.</p>
      </div>
      <label className="flex items-start gap-3 rounded-xl bg-paper p-3 text-sm">
        <input type="checkbox" name="consent" required className="mt-1 h-5 w-5 shrink-0" style={{ accentColor: accent }} />
        <span>{consent}</span>
      </label>
      {state?.error && <p className="text-sm font-semibold text-brand">{state.error}</p>}
      <button disabled={pending} className="min-h-12 w-full rounded-full px-6 text-[16px] font-extrabold text-white disabled:opacity-60" style={{ background: accent }}>
        {pending ? "Signing…" : "Sign"}
      </button>
    </form>
  );
}
