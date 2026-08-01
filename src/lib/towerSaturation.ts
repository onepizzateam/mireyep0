export interface TowerSaturation {
  saturationRatio: number;
  isSaturated: boolean;
  currentTenants: number;
  maxTenants: number;
  structureType: string;
  label: string;
}

const MAX_TENANTS: Record<string, number> = { GUYED: 4, SELF_SUPPORTING: 3, MONOPOLE: 2, BUILDING: 2, WATER_TOWER: 1 };

export function computeTowerSaturation(structureType: string | null | undefined, carriersPresent: string[]): TowerSaturation | null {
  if (!structureType || carriersPresent.length === 0) return null;
  const type = structureType.toUpperCase();
  const max = MAX_TENANTS[type] ?? 2;
  const current = carriersPresent.length;
  const ratio = Math.min(current / max, 1);
  return { saturationRatio: ratio, isSaturated: ratio >= .75, currentTenants: current, maxTenants: max, structureType: type, label: `${type} tower: ${current}/${max} tenants (${Math.round(ratio * 100)}% capacity)` };
}
