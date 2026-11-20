"use client";

import { useEffect, useRef, useState } from "react";

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Paso 3: "¿Cuándo vence?" con atajos; la fecha se ve siempre y se puede cambiar a mano. */
export function DueDatePicker({ issueDate, initial }: { issueDate: string; initial: string | null }) {
  const options = [
    { days: 0, label: "Al recibirla" },
    { days: 15, label: "15 días" },
    { days: 30, label: "30 días" },
  ];
  const [value, setValue] = useState(initial ?? addDays(issueDate, 15));
  const [nudge, setNudge] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  // Al tocar un atajo, se guarda en cuanto la fecha nueva ya está en la página.
  useEffect(() => {
    if (nudge) input.current?.form?.requestSubmit();
  }, [nudge]);
  const picked = options.find((o) => addDays(issueDate, o.days) === value)?.days;

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {options.map((o) => (
          <button
            key={o.days}
            type="button"
            data-nosave
            onClick={() => {
              setValue(addDays(issueDate, o.days));
              setNudge((n) => n + 1);
            }}
            className={`min-h-11 rounded-xl border px-3 text-sm font-bold transition ${picked === o.days ? "border-2 border-navy bg-navy-tint text-navy" : "border-line bg-white text-ink hover:border-navy/40"}`}
          >
            {o.label}
          </button>
        ))}
        <span className={`grid min-h-11 place-items-center rounded-xl border px-3 text-sm font-bold ${picked === undefined ? "border-2 border-navy bg-navy-tint text-navy" : "border-dashed border-line text-faint"}`}>
          Otra fecha
        </span>
      </div>
      <div className="max-w-56">
        <label className="label" htmlFor="w-due">Vence el</label>
        <input ref={input} id="w-due" name="due_date" type="date" value={value} onChange={(e) => setValue(e.target.value)} className="input" />
      </div>
    </div>
  );
}
