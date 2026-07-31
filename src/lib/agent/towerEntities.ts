export const TOWER_COMPANY_ENTITIES = [
  "AMERICAN TOWER", "AMT", "CROWN CASTLE", "CROWN ATLANTIC", "SBA COMMUNICATIONS",
  "VERTICAL BRIDGE", "TILLMAN INFRASTRUCTURE", "PHOENIX TOWER", "LANDMARK DIVIDEND", "GLOBAL SIGNAL",
] as const;
export const CARRIER_MNC_MAP: Record<string, string> = {
  "310-410": "AT&T", "310-260": "T-Mobile", "311-480": "Verizon", "311-870": "Dish", "311-580": "US Cellular",
};
export function isTowerCompany(name: string) { const value = name.toUpperCase(); return TOWER_COMPANY_ENTITIES.some((entity) => value.includes(entity)); }
export function resolveCarrierName(mcc: string | number, mnc: string | number) { return CARRIER_MNC_MAP[`${mcc}-${mnc}`] ?? `MCC${mcc}/MNC${mnc}`; }
