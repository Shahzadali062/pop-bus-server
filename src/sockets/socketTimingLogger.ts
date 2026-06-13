import type {
  Server,
  Socket,
} from "socket.io";

type WebLocationDebugPayload = {
  busId?: string;
  timestamp?: number;
  clientSentAt?: number;
  sequence?: number;
  source?: string;
  visibility?: string;
};

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString(
    "en-GB",
    {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    }
  );
}

export function registerSocketTimingLogger(
  io: Server
) {
  io.on("connection", (socket: Socket) => {
    socket.onAny(
      (
        eventName: string,
        ...argumentsList: unknown[]
      ) => {
        if (eventName === "debug:map-received") {
          console.log("[MAP_RECEIVED]", argumentsList[0]);
          return;
        }

        if (
          eventName !==
          "driver:location-update"
        ) {
          return;
        }

        const payload =
          (argumentsList[0] ||
            {}) as WebLocationDebugPayload;

        if (payload.source !== "web") {
          return;
        }

        const serverReceivedAt =
          Date.now();

        const clientSentAt =
          Number(payload.clientSentAt) ||
          serverReceivedAt;

        const delayMs = Math.max(
          0,
          serverReceivedAt -
            clientSentAt
        );

        const timing = {
          busId: String(
            payload.busId || "UNKNOWN"
          ),
          sequence:
            payload.sequence ?? null,
          visibility:
            payload.visibility ??
            "unknown",
          webSentTime:
            formatTime(clientSentAt),
          serverReceivedTime:
            formatTime(
              serverReceivedAt
            ),
          networkDelayMs: delayMs,
          deviceLocationTime:
            payload.timestamp
              ? formatTime(
                  Number(
                    payload.timestamp
                  )
                )
              : null,
          socketId: socket.id,
        };

        console.log(
          "[WEB_LOCATION_TIMING]",
          timing
        );

        io.emit(
          "debug:web-location-timing",
          timing
        );
      }
    );
  });
}

