import type { RequestHandler } from "express";

export const handleEnvCheck: RequestHandler = (_req, res) => {
  const hasGitHub = Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim());
  const hasGemini = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
  res.json({ hasGitHub, hasGemini });
};
