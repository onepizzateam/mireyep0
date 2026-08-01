export interface TowerSaturation {
  saturationRatio: number;
  isSaturated: boolean;
  currentTenants: number;
  maxTenants: number;
  structureType: string;
  label: string;
  scoringImpact: "positive" | "negative" | "neutral";
  pointAdjustment: number;
}

export const TOWER_MAX_TENANTS: Record<string, number> = { GTOWER: 4, GUYED: 4, LTOWER: 3, LATTICE: 3, SELF_SUPPORTING: 3, MONOPOLE: 2, BUILDING: 2, WATERTOWER: 1, WATER_TOWER: 1, SILO: 1, SIGN: 1 };

export function computeTowerSaturation(structureType: string | null | undefined, carriersPresent: string[]): TowerSaturation | null {
  if (!structureType || carriersPresent.length === 0) return null;
  const type = structureType.toUpperCase().replace(/[\s-]/g, "_");
  const max = TOWER_MAX_TENANTS[type] ?? 2;
  const current = carriersPresent.length;
  const ratio = Math.min(current / max, 1);
  const isSaturated = ratio >= .75;
  return { saturationRatio: ratio, isSaturated, currentTenants: current, maxTenants: max, structureType: type, label: `${type} tower: ${current}/${max} tenants (${Math.round(ratio * 100)}% capacity)`, scoringImpact: isSaturated ? "positive" : "negative", pointAdjustment: isSaturated ? 12 : -8 };
}

export function saturationLeverageSentence(sat: TowerSaturation): string {
  return sat.isSaturated
    ? `The nearest tower is a ${sat.structureType} at ${Math.round(sat.saturationRatio * 100)}% structural capacity (${sat.currentTenants}/${sat.maxTenants} tenants) — it cannot absorb another carrier.`
    : `The nearest tower is a ${sat.structureType} at ${Math.round(sat.saturationRatio * 100)}% capacity (${sat.currentTenants}/${sat.maxTenants} tenants) — it has room for another carrier.`;
}
