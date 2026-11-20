"use client";

import { useState } from "react";

export type PickerPackage = {
  id: string;
  name: string;
  needsSquares: boolean;
  itemCount: number;
  tier?: "good" | "better" | "best" | null;
};

/**
 * Elige un paquete. Si el paquete (o los de Good/Better/Best) tiene items "por square",
 * pide los squares del techo. Con showTiers aparece la casilla Good / Better / Best.
 */
export function PackagePicker({
  packages,
  optional = false,
  showTiers = false,
}: {
  packages: PickerPackage[];
  optional?: boolean;
  showTiers?: boolean;
}) {
  const [id, setId] = useState(optional ? "" : (packages[0]?.id ?? ""));
  const [tiers, setTiers] = useState(false);
  const pkg = packages.find((p) => p.id === id);
  const tierPkgs = packages.filter((p) => p.tier);
  const askSquares = !!pkg?.needsSquares || (tiers && tierPkgs.some((p) => p.needsSquares));

  return (
    <>
      <select name="package_id" value={id} onChange={(e) => setId(e.target.value)} className="input w-auto min-w-48" required={!optional}>
        {optional && <option value="">{tiers && tierPkgs.length ? "Paquetes de cada nivel" : "Sin paquete (en blanco)"}</option>}
        {packages.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {p.itemCount} {p.itemCount === 1 ? "item" : "items"}
          </option>
        ))}
      </select>
      {showTiers && (
        <label className="flex items-center gap-1.5 text-sm text-muted">
          <input type="checkbox" name="tiers" checked={tiers} onChange={(e) => setTiers(e.target.checked)} className="accent-navy" />
          Good / Better / Best
        </label>
      )}
      {askSquares && (
        <label className="flex items-center gap-2">
          <input
            name="squares"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="Squares"
            className="input num w-28"
            aria-label="Squares del techo"
          />
          <span className="font-label text-[11px] uppercase tracking-[0.08em] text-faint">SQ</span>
        </label>
      )}
      {showTiers && tiers && tierPkgs.length > 0 && (
        <span className="w-full font-label text-[11px] text-faint">
          {tierPkgs
            .sort((a, b) => ["good", "better", "best"].indexOf(a.tier!) - ["good", "better", "best"].indexOf(b.tier!))
            .map((p) => `${p.tier![0].toUpperCase()}${p.tier!.slice(1)}: ${p.name}`)
            .join("  ·  ")}
        </span>
      )}
    </>
  );
}
