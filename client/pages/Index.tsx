import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { GenerateReadmeRequest, GenerateReadmeResponse } from "@shared/api";

function validateUrl(url: string): boolean {
  return /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\/)?$/i.test(url.trim());
}

export default function Index() {
  const [repoUrl, setRepoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readme, setReadme] = useState("");
  const [fileName, setFileName] = useState("README.md");
  const [apiErrors, setApiErrors] = useState<{ code: string; message: string }[]>([]);

  const canSubmit = useMemo(() => validateUrl(repoUrl) && !loading, [repoUrl, loading]);

  const onSubmit = async () => {
    setError(null);
    setApiErrors([]);
    setReadme("");
    if (!validateUrl(repoUrl)) {
      setError("Invalid GitHub repository URL. Use https://github.com/<owner>/<repo>");
      return;
    }
    setLoading(true);
    try {
      const payload: GenerateReadmeRequest = { repoUrl: repoUrl.trim() };
      const res = await fetch("/api/generate-readme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const bodyText = await res.text();
      let data: any = null;
      try {
        data = bodyText ? JSON.parse(bodyText) : null;
      } catch {
        data = null;
      }
      if (!res.ok) {
        setError((data?.error as string) || `Request failed (${res.status})`);
        setLoading(false);
        return;
      }
      const ok = data as GenerateReadmeResponse;
      setReadme(ok.readme);
      setFileName(ok.fileName || "README.md");
      setApiErrors(ok.errors || []);
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!readme) return;
    await navigator.clipboard.writeText(readme);
  };

  const downloadFile = () => {
    if (!readme) return;
    const blob = new Blob([readme], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName || "README.md";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_-10%,hsl(var(--primary)/0.2),transparent_60%)]" />
        <header className="container py-10 flex items-center justify-between">
          <a href="/" className="font-extrabold tracking-tight text-2xl bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-500">
            README Forge
          </a>
          <div className="text-sm text-muted-foreground">Generate perfect READMEs from any GitHub URL</div>
        </header>
        <main className="container pb-16">
          <section className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-tight">
              Turn a GitHub link into a professional README.md
            </h1>
            <p className="mt-4 text-muted-foreground text-lg">
              Validates the repository, fetches metadata via GitHub API, fills gaps with Gemini, and outputs a complete, well-formatted README you can download.
            </p>
          </section>

          <section className="mx-auto mt-10 max-w-3xl rounded-xl border bg-card p-4 md:p-6 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <Input
                placeholder="https://github.com/owner/repo"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                className="md:flex-1"
              />
              <Button onClick={onSubmit} disabled={!canSubmit} className="md:w-40 h-11 text-base font-semibold">
                {loading ? "Generating…" : "Generate README"}
              </Button>
            </div>
            {!validateUrl(repoUrl) && repoUrl.length > 0 && (
              <p className="mt-2 text-sm text-destructive">Expected format: https://github.com/&lt;owner&gt;/&lt;repo&gt;</p>
            )}
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            {apiErrors.length > 0 && (
              <div className="mt-2 text-sm text-amber-600">
                {apiErrors.map((e) => (
                  <div key={e.code}>{e.message}</div>
                ))}
              </div>
            )}
          </section>

          <section className="mx-auto mt-8 max-w-5xl">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-semibold">Preview</h2>
              <div className="flex gap-2">
                <Button variant="outline" onClick={copyToClipboard} disabled={!readme}>
                  Copy
                </Button>
                <Button onClick={downloadFile} disabled={!readme}>
                  Download README.md
                </Button>
              </div>
            </div>
            <div className="rounded-xl border bg-card p-0 overflow-hidden">
              <div className="max-h-[60vh] overflow-auto">
                <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed p-4 md:p-6">
{readme || `# Project Title\n\n## Description\nNot specified.\n\n## Features\n- Not specified.\n\n## Installation Guide\nNot specified.\n\n## Usage\nNot specified.\n\n## Tech Stack\n- Not specified.\n\n## Project Structure\nNot specified.\n\n## License Information\nNot specified.`}
                </pre>
              </div>
            </div>
          </section>
        </main>
        <footer className="container py-10 text-center text-sm text-muted-foreground">
          All sections are mandatory. Errors are never hidden. Set GITHUB_TOKEN and GEMINI_API_KEY in server env.
        </footer>
      </div>
    </div>
  );
}
