const OLLAMA_URL =
  process.env.OLLAMA_BASE_URL || "http://localhost:11434";

const OLLAMA_MODEL =
  process.env.OLLAMA_MODEL || "llama3.2:3b";

export type AiQueryPlan = {
  busId: string | null;
  needsActiveBuses: boolean;
  needsLatestSavedLocations: boolean;
  needsBusHistory: boolean;
  needsDatabaseSummary: boolean;
  needsRegisteredBuses: boolean;
  needsRoutes: boolean;
  needsTrips: boolean;
  needsEvents: boolean;
  needsTelemetry: boolean;
  needsPreviousConversations: boolean;
  needsPlaceNames: boolean;
  historyLimit: number;
};

const DEFAULT_PLAN: AiQueryPlan = {
  busId: null,
  needsActiveBuses: true,
  needsLatestSavedLocations: false,
  needsBusHistory: false,
  needsDatabaseSummary: false,
  needsRegisteredBuses: false,
  needsRoutes: false,
  needsTrips: false,
  needsEvents: false,
  needsTelemetry: false,
  needsPreviousConversations: false,
  needsPlaceNames: true,
  historyLimit: 50,
};

function normalizePlan(value: Partial<AiQueryPlan>): AiQueryPlan {
  const limit = Number(value.historyLimit);

  return {
    busId:
      typeof value.busId === "string" && value.busId.trim()
        ? value.busId.trim().toUpperCase()
        : null,

    needsActiveBuses: Boolean(value.needsActiveBuses),
    needsLatestSavedLocations: Boolean(
      value.needsLatestSavedLocations
    ),
    needsBusHistory: Boolean(value.needsBusHistory),
    needsDatabaseSummary: Boolean(value.needsDatabaseSummary),
    needsRegisteredBuses: Boolean(value.needsRegisteredBuses),
    needsRoutes: Boolean(value.needsRoutes),
    needsTrips: Boolean(value.needsTrips),
    needsEvents: Boolean(value.needsEvents),
    needsTelemetry: Boolean(value.needsTelemetry),
    needsPreviousConversations: Boolean(
      value.needsPreviousConversations
    ),
    needsPlaceNames: value.needsPlaceNames !== false,

    historyLimit: Number.isFinite(limit)
      ? Math.min(Math.max(Math.floor(limit), 10), 300)
      : 50,
  };
}

export async function createAiQueryPlan(
  question: string
): Promise<AiQueryPlan> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        format: "json",
        options: {
          temperature: 0,
        },
        messages: [
          {
            role: "system",
            content: `
You are a query planner for a bus fleet database.

Return only valid JSON.

Available read-only datasets:
- activeBuses: buses currently online
- latestSavedLocations: latest stored location for every known bus
- busHistory: location history for one specified bus
- databaseSummary: record totals and fleet counts
- registeredBuses: bus name, capacity and status
- routes: routes and route stops
- trips: recent trips and performance
- events: delays, breakdowns and emergencies
- telemetry: battery, network, GPS and app-state records
- previousConversations: recent AI chat history
- placeNames: convert coordinates into readable locations

Rules:
- Detect a bus ID from the question when present.
- Set busId to null when no specific bus is mentioned.
- For current/online questions, request activeBuses.
- For past movement/history questions, request busHistory.
- For complete fleet reports, request relevant summaries, trips, events and telemetry.
- historyLimit must be between 10 and 300.
`,
          },
          {
            role: "user",
            content: question,
          },
        ],
      }),
    });

    if (!response.ok) {
      return DEFAULT_PLAN;
    }

    const data = (await response.json()) as {
      message?: {
        content?: string;
      };
    };

    const rawContent = data.message?.content;

    if (!rawContent) {
      return DEFAULT_PLAN;
    }

    const plan = normalizePlan(
      JSON.parse(rawContent) as Partial<AiQueryPlan>
    );

    const normalizedQuestion = question.toLowerCase();

    const asksForCurrentData =
      /\b(active|online|live|current|currently|now|right now|where is|where are)\b/i.test(
        normalizedQuestion
      );

    if (asksForCurrentData) {
      plan.needsActiveBuses = true;
      plan.needsPlaceNames = true;
    }

    return plan;
  } catch (error) {
    console.log("[AI_PLANNER] Planning failed", {
      message:
        error instanceof Error
          ? error.message
          : "Unknown planner error",
    });

    return DEFAULT_PLAN;
  }
}

