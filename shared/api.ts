/**
 * Shared code between client and server
 * Useful to share types between client and server
 * and/or small pure JS functions that can be used on both client and server
 */

/**
 * Example response type for /api/demo
 */
export interface DemoResponse {
  message: string;
}

export interface GenerateReadmeRequest {
  repoUrl: string;
}

export interface RepoMetadata {
  owner: string;
  repo: string;
  name: string;
  description: string | null;
  languages: string[];
  license: string | null;
  defaultBranch: string;
  homepage: string | null;
  topics: string[];
  tree: string[]; // list of paths
}

export interface GeneratedSections {
  description?: string;
  features?: string[];
  usage?: string;
  installation?: string;
}

export interface GenerateReadmeResponse {
  readme: string;
  fileName: string;
  metadata: RepoMetadata;
  filledWithGemini: Partial<Record<keyof GeneratedSections, boolean>>;
  errors?: { code: string; message: string }[];
}

export interface ErrorResponse {
  error: string;
  code: string;
}
