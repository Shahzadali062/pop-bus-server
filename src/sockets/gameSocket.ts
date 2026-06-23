import { Server, Socket } from "socket.io";

type GameRole = "viewer" | "controller";

const ALLOWED_CONTROLS = new Set([
  "forward-down",
  "forward-up",
  "back-down",
  "back-up",
  "left-down",
  "left-up",
  "right-down",
  "right-up",
  "jump",
  "boost",
  "restart",
]);

function normalizeRoomId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const roomId = value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");

  return roomId.length >= 3 && roomId.length <= 24 ? roomId : null;
}

function normalizeControl(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const control = value.trim().toLowerCase();

  return ALLOWED_CONTROLS.has(control) ? control : null;
}

export function registerGameSocketHandlers(io: Server) {
  io.on("connection", (socket: Socket) => {
    socket.on(
      "game:join-room",
      (
        payload: {
          roomId?: string;
          role?: GameRole;
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

        const roomName = `game:${roomId}`;
        socket.join(roomName);
        socket.data.gameRoomId = roomId;
        socket.data.gameRole = payload?.role ?? "viewer";

        socket.emit("game:room-joined", {
          roomId,
          role: socket.data.gameRole,
        });

        socket.to(roomName).emit("game:peer-joined", {
          roomId,
          role: socket.data.gameRole,
          socketId: socket.id,
        });

        callback?.({
          ok: true,
          roomId,
        });
      }
    );

    socket.on("disconnect", () => {
      const roomId = socket.data.gameRoomId;
      const role = socket.data.gameRole;

      if (roomId && role) {
        socket.to(`game:${roomId}`).emit("game:peer-left", {
          roomId,
          role,
          socketId: socket.id,
        });
      }
    });

    socket.on(
      "game:control-command",
      (
        payload: {
          roomId?: string;
          control?: string;
        },
        callback?: (response: {
          ok: boolean;
          message?: string;
        }) => void
      ) => {
        const roomId = normalizeRoomId(payload?.roomId);
        const control = normalizeControl(payload?.control);

        if (!roomId || !control) {
          callback?.({
            ok: false,
            message: "Invalid roomId or control",
          });
          return;
        }

        socket.to(`game:${roomId}`).emit("game:control-command", {
          roomId,
          control,
          commandId: `${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}`,
          sentAt: Date.now(),
        });

        callback?.({
          ok: true,
        });
      }
    );
  });
}
