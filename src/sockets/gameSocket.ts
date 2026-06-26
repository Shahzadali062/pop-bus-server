import fs from "node:fs";
import path from "node:path";
import { Server, Socket } from "socket.io";

type GameRole = "viewer" | "controller";

type GameBestScore = {
  score: number;
  roomId?: string;
  updatedAt?: string;
};

const BEST_SCORE_FILE = path.resolve(
  process.cwd(),
  "data",
  "mini-game-best-score.json"
);

const ALLOWED_CONTROLS = new Set([
  "jump",
  "boost",
  "restart",
  "pause",
  "resume",
  "start",

  // Old button controls are kept for backward compatibility.
  "forward-down",
  "forward-up",
  "back-down",
  "back-up",
  "left-down",
  "left-up",
  "right-down",
  "right-up",
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

function normalizeAxis(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(-1, Math.min(1, value));
}

function normalizeScore(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(999999, Math.floor(value)));
}

function loadBestScore(): GameBestScore {
  try {
    const raw = fs.readFileSync(BEST_SCORE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<GameBestScore>;
    const score = normalizeScore(parsed.score);

    if (score === null) {
      return { score: 0 };
    }

    return {
      score,
      roomId: typeof parsed.roomId === "string" ? parsed.roomId : undefined,
      updatedAt:
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined,
    };
  } catch {
    return { score: 0 };
  }
}

function saveBestScore(bestScore: GameBestScore) {
  fs.mkdirSync(path.dirname(BEST_SCORE_FILE), { recursive: true });
  fs.writeFileSync(BEST_SCORE_FILE, JSON.stringify(bestScore, null, 2));
}

let bestScore = loadBestScore();

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

        socket.emit("game:best-score-updated", bestScore);

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

    socket.on(
      "game:best-score:get",
      (callback?: (response: { ok: boolean; bestScore: GameBestScore }) => void) => {
        callback?.({
          ok: true,
          bestScore,
        });
      }
    );

    socket.on(
      "game:score-submit",
      (
        payload: {
          roomId?: string;
          score?: number;
        },
        callback?: (response: {
          ok: boolean;
          bestScore?: GameBestScore;
          updated?: boolean;
          message?: string;
        }) => void
      ) => {
        const score = normalizeScore(payload?.score);

        if (score === null) {
          callback?.({
            ok: false,
            message: "Invalid score",
          });
          return;
        }

        const roomId = normalizeRoomId(payload?.roomId) ?? undefined;

        if (score > bestScore.score) {
          bestScore = {
            score,
            roomId,
            updatedAt: new Date().toISOString(),
          };

          try {
            saveBestScore(bestScore);
          } catch {
            // Keep runtime best score even when the host filesystem is read-only.
          }

          io.emit("game:best-score-updated", bestScore);

          callback?.({
            ok: true,
            bestScore,
            updated: true,
          });
          return;
        }

        callback?.({
          ok: true,
          bestScore,
          updated: false,
        });
      }
    );

    socket.on(
      "game:joystick-command",
      (
        payload: {
          roomId?: string;
          x?: number;
          y?: number;
        },
        callback?: (response: {
          ok: boolean;
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

        const x = normalizeAxis(payload?.x);
        const y = normalizeAxis(payload?.y);
        const magnitude = Math.min(1, Math.sqrt(x * x + y * y));

        socket.to(`game:${roomId}`).emit("game:joystick-command", {
          roomId,
          x,
          y,
          magnitude,
          sentAt: Date.now(),
        });

        callback?.({
          ok: true,
        });
      }
    );
  });
}
