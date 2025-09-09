// Minimal Netlify Function router to avoid Express dependency
import { performGenerate } from "../../server/routes/generate-readme";

export async function handler(event: any) {
  const path = event.path || "";
  const method = (event.httpMethod || "GET").toUpperCase();

  if (path.endsWith("/api/ping") && method === "GET") {
    return json({ message: process.env.PING_MESSAGE ?? "ping" });
  }
  if (path.endsWith("/api/env-check") && method === "GET") {
    const hasGitHub = Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim());
    const hasGemini = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
    return json({ hasGitHub, hasGemini });
  }
  if (path.endsWith("/api/generate-readme") && method === "POST") {
    try {
      const body = event.body ? JSON.parse(event.body) : {};
      const repoUrl = (body?.repoUrl || "").trim();
      if (!repoUrl) return json({ error: "Repository URL is required.", code: "MISSING_REPO_URL" }, 400);
      const payload = await performGenerate(repoUrl, process.env.GITHUB_TOKEN, process.env.GEMINI_API_KEY);
      return json(payload);
    } catch (e: any) {
      const status = e?.code === "INVALID_REPO_URL" ? 400 : e?.code?.includes("GITHUB") ? 502 : 500;
      return json({ error: e?.error || e?.message || "Internal error", code: e?.code || "INTERNAL_ERROR" }, status);
    }
  }

  return json({ error: "Not Found" }, 404);
}

function json(data: any, status = 200) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}
