import express, { Request, Response } from "express";

const app = express();

const PORT = 4100;
const LOCAL_AI_URL = "http://localhost:4000/api/ai/chat";
const AI_TUNNEL_KEY = process.env.AI_TUNNEL_KEY;

app.use(express.json({ limit: "100kb" }));

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "Pop Bus AI Gateway",
  });
});

app.post("/ai/chat", async (req: Request, res: Response) => {
  try {
    const suppliedKey = req.header("x-ai-key");

    if (!AI_TUNNEL_KEY || suppliedKey !== AI_TUNNEL_KEY) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized",
      });
    }

    const response = await fetch(LOCAL_AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req.body),
    });

    const responseText = await response.text();

    res
      .status(response.status)
      .type(response.headers.get("content-type") || "application/json")
      .send(responseText);
  } catch (error) {
    res.status(502).json({
      status: "error",
      message: "Local AI service is unavailable",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Protected AI Gateway running on http://localhost:${PORT}`);
});
