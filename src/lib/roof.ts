// Squares aproximados a partir de los segmentos de techo de Google Solar API
// (buildingInsights.solarPotential.roofSegmentStats). 1 square = 100 ft².

export type RoofSegment = {
  pitchDegrees: number;
  stats: { areaMeters2?: number; groundAreaMeters2?: number };
};

export type RoofEstimate = {
  areaSqFt: number;
  rawSquares: number;
  wastePct: number;
  squaresWithWaste: number;
  predominantPitch: string; // ej. "6/12"
  segmentCount: number;
};

const SQFT_PER_M2 = 10.7639;

export function pitchToRise(pitchDegrees: number): number {
  return Math.round(Math.tan((pitchDegrees * Math.PI) / 180) * 12);
}

/** Área inclinada de un segmento; si solo hay área de piso, la corrige por el pitch. */
export function segmentSlopedArea(seg: RoofSegment): number {
  if (seg.stats.areaMeters2 && seg.stats.areaMeters2 > 0) return seg.stats.areaMeters2;
  const ground = seg.stats.groundAreaMeters2 ?? 0;
  const cos = Math.cos((seg.pitchDegrees * Math.PI) / 180);
  return cos > 0 ? ground / cos : ground;
}

/** 10% para techos simples (≤4 caras, tipo gable), 15% para hip o complicados. */
export function suggestWastePct(segmentCount: number): number {
  return segmentCount <= 4 ? 10 : 15;
}

/** Redondea hacia arriba al tercio de square (los bundles vienen de 3 por square). */
export const roundUpToThird = (sq: number) => Math.ceil(sq * 3 - 1e-9) / 3;

export function estimateSquares(segments: RoofSegment[], wastePct?: number): RoofEstimate {
  const areaM2 = segments.reduce((s, seg) => s + segmentSlopedArea(seg), 0);
  const areaSqFt = areaM2 * SQFT_PER_M2;
  const rawSquares = areaSqFt / 100;
  const waste = wastePct ?? suggestWastePct(segments.length);

  // Pitch predominante = el del segmento con más área
  let best = segments[0];
  for (const s of segments) if (segmentSlopedArea(s) > segmentSlopedArea(best)) best = s;

  return {
    areaSqFt: Math.round(areaSqFt),
    rawSquares: Math.round(rawSquares * 100) / 100,
    wastePct: waste,
    squaresWithWaste: Math.round(roundUpToThird(rawSquares * (1 + waste / 100)) * 100) / 100,
    predominantPitch: best ? `${pitchToRise(best.pitchDegrees)}/12` : "—",
    segmentCount: segments.length,
  };
}
