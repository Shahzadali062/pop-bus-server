export function normalizeBusId(busId: unknown) {
  return String(busId || "").trim().toUpperCase();
}

export function isValidBusId(busId: unknown) {
  return normalizeBusId(busId).length > 0;
}
