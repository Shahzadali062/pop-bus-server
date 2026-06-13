import { Router } from "express";

import { buildAiFleetContext } from "../services/aiFleetContext";
import { saveAiConversation } from "../repositories/fleetReadRepository";

const OLLAMA_URL =
  process.env.OLLAMA_BASE_URL || "http://localhost:11434";

const OLLAMA_MODEL =
  process.env.OLLAMA_MODEL || "llama3.2:3b";

const AI_TIMEOUT_MS = 60000;

const AI_GATEWAY_URL =
  process.env.AI_GATEWAY_URL?.replace(/\/+$/, "");

const AI_TUNNEL_KEY =
  process.env.AI_TUNNEL_KEY;

type ChatHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

export function createAiRoutes() {
  const router = Router();

  router.post("/api/ai/chat", async (req, res) => {
    try {
      const question = String(req.body?.message || "")
        .trim()
        .slice(0, 1500);

      if (!question) {
        return res.status(400).json({
          status: "error",
          message: "Message is required",
        });
      }

      if (AI_GATEWAY_URL && AI_TUNNEL_KEY) {
        const gatewayResponse = await fetch(
          `${AI_GATEWAY_URL}/ai/chat`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-ai-key": AI_TUNNEL_KEY,
            },
            body: JSON.stringify({
              message: question,
              history: req.body?.history ?? [],
            }),
          }
        );

        const gatewayBody = await gatewayResponse.text();

        return res
          .status(gatewayResponse.status)
          .type(
            gatewayResponse.headers.get("content-type") ||
              "application/json"
          )
          .send(gatewayBody);
      }

      const history = Array.isArray(req.body?.history)
        ? (req.body.history as ChatHistoryItem[])
            .filter(
              (item) =>
                item &&
                (item.role === "user" ||
                  item.role === "assistant") &&
                typeof item.content === "string"
            )
            .slice(-8)
        : [];

      const { plan, context } =
        await buildAiFleetContext(question);

      const controller = new AbortController();

      const timeout = setTimeout(() => {
        controller.abort();
      }, AI_TIMEOUT_MS);

      try {
        const response = await fetch(`${OLLAMA_URL}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: OLLAMA_MODEL,
            stream: false,
            options: {
              temperature: 0.35,
              top_p: 0.9,
              num_predict: 700,
              repeat_penalty: 1.08,
            },
            messages: [
              {
                role: "system",
                content: `
You are a Student Tracking Assistant.

You answer questions about online students, student tracking activity,
locations, routes, trips, GPS quality, telemetry,
events and tracking history.

Response rules:
- Reply naturally like a helpful human assistant.
- Reply in the same language and writing style as the user.
- For Roman Urdu questions, answer in Roman Urdu.
- Give the direct answer first.
- For current-location questions, give one natural and helpful sentence first.
- Use the most specific readable location available from fullAddress, such as a landmark, road, intersection, neighbourhood, district and city.
- Say "near" when the location represents a nearby landmark or road rather than an exact building.
- Do not mention only a broad district when a more specific road or landmark is available.
- Include the student name or ID, how recently the location updated, and movement speed when available.
- Mention coordinates only when the user specifically asks for them.
- Convert speed to km/h when needed.
- Explain GPS accuracy in simple language.
- Clearly mention whether data is live, saved history,
  unavailable or potentially outdated.
- Never invent students, locations, routes, trips,
  drivers, statistics or incidents.
- Never mention query plans, internal planning, metadata, context selection or implementation details.
- Do not expose raw JSON or database table names.
- Always provide a complete and useful answer, not just one short sentence.
- Start with a direct natural-language answer.
- Then explain the important available details.
- For current student location questions, mention:
  student name or ID, readable location, last update time, movement speed and GPS quality when available.
- For history questions, explain movement patterns, tracking gaps, speed changes and unusual points.
- For comparison questions, compare students using the available tracking evidence.
- For student tracking reports, use:
  Summary
  Current student tracking status
  Key findings
  Possible issues
  Recommendations
- For routes, trips, events and telemetry questions, explain all relevant available records.
- Clearly distinguish live data from saved historical data.
- If some requested data is missing, explain exactly what is unavailable.
- Never give a vague answer when useful data exists in the provided student tracking context.
- Keep the wording natural and professional, while still giving enough detail to be useful.
- A student should not be described as moving unless the
  available speed data reasonably supports it.
- If the requested information does not exist,
  clearly say what data is missing.
`,
              },
              ...history,
              {
                role: "user",
                content: `
Current student tracking context:
${JSON.stringify(context, null, 2)}

User question:
${question}
`,
              },
            ],
          }),
        });

        if (!response.ok) {
          return res.status(502).json({
            status: "error",
            message: `LLM server returned ${response.status}`,
          });
        }

        const data = (await response.json()) as {
          message?: {
            content?: string;
          };
        };

        const answer =
          data.message?.content?.trim() ||
          "I could not generate an answer from the available student tracking data.";

        saveAiConversation(
          question,
          answer,
          OLLAMA_MODEL
        );

        return res.json({
          status: "ok",
          model: OLLAMA_MODEL,
          answer,
          meta: {
            busId: plan.busId,
            placeNamesUsed: plan.needsPlaceNames,
            generatedAt: new Date().toISOString(),
          },
        });
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      const isTimeout =
        error instanceof Error &&
        error.name === "AbortError";

      return res.status(isTimeout ? 504 : 500).json({
        status: "error",
        message: isTimeout
          ? "AI response timed out"
          : "AI chat failed",
        details:
          error instanceof Error
            ? error.message
            : "Unknown error",
      });
    }
  });

  return router;
}






