import { BusLocationPayload } from "../types/busLocation";
import { normalizeBusId } from "./busId";

export function normalizeLocationPayload(payload: Partial<BusLocationPayload>) {
  return {
    ...payload,
    busId: normalizeBusId(payload.busId),
    latitude: Number(payload.latitude),
    longitude: Number(payload.longitude),
    accuracy:
      payload.accuracy === undefined || payload.accuracy === null
        ? null
        : Number(payload.accuracy),
    speed:
      payload.speed === undefined || payload.speed === null
        ? null
        : Number(payload.speed),
    heading:
      payload.heading === undefined || payload.heading === null
        ? null
        : Number(payload.heading),
    timestamp:
      typeof payload.timestamp === "number"
        ? payload.timestamp
        : Date.now(),
  } as BusLocationPayload;
}

export function isValidLocationPayload(payload: Partial<BusLocationPayload>) {
  const normalizedPayload = normalizeLocationPayload(payload);

  return (
    normalizedPayload.busId.length > 0 &&
    Number.isFinite(normalizedPayload.latitude) &&
    Number.isFinite(normalizedPayload.longitude) &&
    normalizedPayload.latitude >= -90 &&
    normalizedPayload.latitude <= 90 &&
    normalizedPayload.longitude >= -180 &&
    normalizedPayload.longitude <= 180
  );
}
