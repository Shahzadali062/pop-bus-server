import { BusLocationPayload } from "./busLocation";

export type ActiveBusLocation = BusLocationPayload & {
  socketId: string;
  lastSeen: number;
};

export type PublicBusLocation = Omit<ActiveBusLocation, "socketId">;
