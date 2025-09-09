import type { RequestHandler } from "express";
import type {
  GenerateReadmeRequest,
  GenerateReadmeResponse,
  RepoMetadata,
  GeneratedSections,
} from "@shared/api";

const GITHUB_REPO_REGEX = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/?|#.?)?$/i;

function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  const m = url.match(GITHUB_REPO_REGEX);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function fetchRepoMetadata(owner: string, repo: string, token: string): Promise<RepoMetadata> {
  const base = `https://api.github.com/repos/${owner}/${repo}`;
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const repoData = await fetchJson<any>(base, { headers });
  const langsData = await fetchJson<Record<string, number>>(`${base}/languages`, { headers });

  // Using git trees for project structure
  const defaultBranch = repoData.default_branch as string;
  const treeData = await fetchJson<{ tree: { path: string; type: string }[] }>(
    `${base}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`,
    { headers },
  );

  const languages = Object.keys(langsData ?? {});

  const license: string | null = repoData.license?.spdx_id ?? repoData.license?.name ?? null;

  const tree = (treeData.tree || [])
    .filter((n) => n.type === "blob" || n.type === "tree")
    .map((n) => n.path)
    .slice(0, 500); // cap for prompt size

  return {
    owner,
    repo,
    name: repoData.name ?? repo,
    description: repoData.description ?? null,
    languages,
    license,
    defaultBranch,
    homepage: repoData.homepage || null,
    topics: repoData.topics || [],
    tree,
  };
}

function buildReadme(
  meta: RepoMetadata,
  generated: GeneratedSections,
  filled: Partial<Record<keyof GeneratedSections, boolean>>,
): string {
  const title = meta.name || `${meta.owner}/${meta.repo}`;
  const description = (generated.description ?? meta.description ?? "Not specified.").trim();

  const featuresArr = (generated.features ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
  const features = featuresArr.length ? featuresArr : ["Not specified."];

  const installation = (generated.installation ?? "Not specified.").trim();
  const usage = (generated.usage ?? "Not specified.").trim();

  const techStack = meta.languages.length ? meta.languages.join(", ") : "Not specified.";

  const structureLines = meta.tree.length ? meta.tree : ["Not specified."];

  const licenseText = (meta.license ?? "Not specified.").toString();

  const parts: string[] = [];
  parts.push(`# ${title}`);
  parts.push("");
  parts.push(`## Description`);
  parts.push(description);
  parts.push("");
  parts.push(`## Features`);
  for (const f of features) parts.push(`- ${f}`);
  parts.push("");
  parts.push(`## Installation Guide`);
  parts.push(installation.includes("```") ? installation : "```bash\n" + installation + "\n```");
  parts.push("");
  parts.push(`## Usage`);
  parts.push(usage.includes("```") ? usage : usage !== "Not specified." ? "```\n" + usage + "\n```" : usage);
  parts.push("");
  parts.push(`## Tech Stack`);
  parts.push(techStack.split(/,\s*/).map((t) => `- ${t}`).join("\n"));
  parts.push("");
  parts.push(`## Project Structure`);
  if (structureLines.length && structureLines[0] !== "Not specified.") {
    // Render as a code block tree for readability
    parts.push("```\n" + structureLines.join("\n") + "\n```");
  } else {
    parts.push("Not specified.");
  }
  parts.push("");
  parts.push(`## License Information`);
  parts.push(licenseText);
  parts.push("");

  return parts.join("\n");
}

async function callGemini(apiKey: string, meta: RepoMetadata): Promise<GeneratedSections> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${encodeURIComponent(apiKey)}`;

  const prompt = [
    `You are helping to create a high-quality README.md for a GitHub repository using the template sections:`,
    `Description, Features, Installation Guide, Usage.`,
    `Given the repository context below, output a concise JSON object with keys:`,
    `{"description": string, "features": string[], "installation": string, "usage": string}.`,
    `Rules:`,
    `- Keep content factual based on provided metadata; avoid hallucinating specific commands that are unlikely.`,
    `- Installation should be actionable; if unknown, provide generic steps based on common stacks.`,
    `- Keep features as 4-8 bullet points, short and value-focused.`,
    `- Usage can include minimal examples in code fences.`,
    `- Do not include markdown headings in values.`,
    `Repository metadata:`,
    JSON.stringify(
      {
        name: meta.name,
        description: meta.description,
        languages: meta.languages,
        license: meta.license,
        defaultBranch: meta.defaultBranch,
        homepage: meta.homepage,
        topics: meta.topics,
        treePreview: meta.tree.slice(0, 120),
      },
      null,
      2,
    ),
  ].join("\n");

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      response_mime_type: "application/json",
    },
  } as const;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${text}`);
  }
  const data = (await res.json()) as any;
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  try {
    const parsed = JSON.parse(text);
    const out: GeneratedSections = {
      description: parsed.description,
      features: Array.isArray(parsed.features) ? parsed.features : undefined,
      installation: parsed.installation,
      usage: parsed.usage,
    };
    return out;
  } catch {
    // Fallback: attempt to use raw text minimally
    return {};
  }
}

export const generateReadmeRoute: RequestHandler = async (req, res) => {
  const errors: { code: string; message: string }[] = [];
  try {
    const body = req.body as GenerateReadmeRequest | undefined;
    const repoUrl = body?.repoUrl?.trim();
    if (!repoUrl) {
      return res.status(400).json({ error: "Repository URL is required.", code: "MISSING_REPO_URL" });
    }
    const parsed = parseRepoUrl(repoUrl);
    if (!parsed) {
      return res
        .status(400)
        .json({ error: "Invalid GitHub repository URL. Expected https://github.com/<owner>/<repo>", code: "INVALID_REPO_URL" });
    }

    const githubToken = process.env.GITHUB_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!githubToken) {
      return res.status(500).json({ error: "Server missing GITHUB_TOKEN environment variable.", code: "MISSING_GITHUB_TOKEN" });
    }
    if (!geminiKey) {
      errors.push({ code: "MISSING_GEMINI_API_KEY", message: "Server missing GEMINI_API_KEY; generated content may be limited." });
    }

    // Fetch repo metadata
    let meta: RepoMetadata;
    try {
      meta = await fetchRepoMetadata(parsed.owner, parsed.repo, githubToken);
    } catch (e: any) {
      return res.status(502).json({ error: `GitHub API error: ${e.message}`.slice(0, 500), code: "GITHUB_API_ERROR" });
    }

    let generated: GeneratedSections = {};
    const filled: Partial<Record<keyof GeneratedSections, boolean>> = {};

    // Decide what needs generation
    const needDescription = !meta.description || meta.description.trim().length < 5;
    const needMore = true; // always ask Gemini for richer sections

    if (geminiKey) {
      try {
        const g = await callGemini(geminiKey, meta);
        generated = { ...generated, ...g };
      } catch (e: any) {
        errors.push({ code: "GEMINI_API_ERROR", message: `Gemini API error: ${e.message}`.slice(0, 500) });
      }
    }

    if (!generated.description && needDescription && meta.description) {
      generated.description = meta.description;
    }

    // Mark what was filled
    (Object.keys(generated) as (keyof GeneratedSections)[]).forEach((k) => {
      if (generated[k]) filled[k] = true;
    });

    const readme = buildReadme(meta, generated, filled);
    const fileName = `${meta.repo}-README.md`;

    const payload: GenerateReadmeResponse = {
      readme,
      fileName,
      metadata: meta,
      filledWithGemini: filled,
      errors: errors.length ? errors : undefined,
    };

    return res.json(payload);
  } catch (err: any) {
    return res.status(500).json({ error: "Unexpected server error.", code: "INTERNAL_ERROR" });
  }
};
