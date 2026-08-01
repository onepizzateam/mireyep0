export function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function displayNumber(value: unknown, digits = 0): string {
  return finiteNumber(value) ? value.toLocaleString(undefined, { maximumFractionDigits: digits }) : "Unavailable";
}

export function displayText(value: unknown, fallback = "Unknown"): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function displayFieldName(value: unknown): string {
  if (!value || typeof value !== "object") return "Unknown";
  const item = value as Record<string, unknown>;
  return displayText(item.fieldName ?? item.field ?? item.name);
}
