import { defineProvider } from "../../contracts";
import { verifyGithubToken } from "./api";

/**
 * GitHub: connected with a fine-grained personal access token for now (ADR 0002, phase 2).
 * Repositories, issues and pull requests come with its record reader (phase 3).
 */
export const github = defineProvider({
  id: "github",
  name: "GitHub",
  description: "Repositories, issues & pull requests",
  auth: [
    {
      kind: "token",
      label: "Fine-grained personal access token",
      help: "Create one under GitHub → Settings → Developer settings → Fine-grained tokens, with read access to Issues, Pull requests and Metadata on the repositories you want here.",
      placeholder: "github_pat_…",
    },
  ],
  baseUrl: {
    label: "API URL",
    default: "https://api.github.com",
    placeholder: "https://github.example.com/api/v3",
  },
  verify: verifyGithubToken,
});
