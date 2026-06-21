import { Server, Socket } from "socket.io";

type CharacterRole = "viewer" | "controller";

const ALLOWED_ACTIONS = new Set([
  "idle",
  "walk",
  "run",
]);

function normalizeRoomId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const roomId = value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");

  return roomId.length >= 3 && roomId.length <= 24 ? roomId : null;
}

function normalizeAction(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const action = value.trim().toLowerCase();

  return ALLOWED_ACTIONS.has(action) ? action : null;
}

export function registerCharacterSocketHandlers(io: Server) {
  io.on("connection", (socket: Socket) => {
    socket.on(
      "character:join-room",
      (
        payload: {
          roomId?: string;
          role?: CharacterRole;
        },
        callback?: (response: {
          ok: boolean;
          roomId?: string;
          message?: string;
        }) => void
      ) => {
        const roomId = normalizeRoomId(payload?.roomId);

        if (!roomId) {
          callback?.({
            ok: false,
            message: "Invalid roomId",
          });
          return;
        }

        const roomName = `character:${roomId}`;
        socket.join(roomName);
        socket.data.characterRoomId = roomId;
        socket.data.characterRole = payload?.role ?? "viewer";

        socket.emit("character:room-joined", {
          roomId,
          role: socket.data.characterRole,
        });

        socket.to(roomName).emit("character:peer-joined", {
          roomId,
          role: socket.data.characterRole,
          socketId: socket.id,
        });

        callback?.({
          ok: true,
          roomId,
        });
      }
    );

    socket.on("disconnect", () => {
      const roomId = socket.data.characterRoomId;
      const role = socket.data.characterRole;

      if (roomId && role) {
        socket.to(`character:${roomId}`).emit("character:peer-left", {
          roomId,
          role,
          socketId: socket.id,
        });
      }
    });

    socket.on(
      "character:animation-command",
      (
        payload: {
          roomId?: string;
          action?: string;
        },
        callback?: (response: {
          ok: boolean;
          message?: string;
        }) => void
      ) => {
        const roomId = normalizeRoomId(payload?.roomId);
        const action = normalizeAction(payload?.action);

        if (!roomId || !action) {
          callback?.({
            ok: false,
            message: "Invalid roomId or action",
          });
          return;
        }

        const eventPayload = {
          roomId,
          action,
          commandId: `${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}`,
          sentAt: Date.now(),
        };

        socket
          .to(`character:${roomId}`)
          .emit("character:animation-command", eventPayload);

        callback?.({
          ok: true,
        });
      }
    );
  });
}

