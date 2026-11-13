import { defineProvider } from "../../contracts";
import { verifyGithubToken } from "./api";
import guide from "./guide.md";
import { githubRecordTypes, githubRecordUrl, searchGithubRecords } from "./records";

/**
 * GitHub: connected with a fine-grained personal access token for now (ADR 0002, phase 2).
 * Its records are the issues and pull requests of every repository the token reads (ADR 0003).
 */
export const github = defineProvider({
  id: "github",
  name: "GitHub",
  description: "Repositories, issues & pull requests",
  auth: [
    {
      kind: "token",
      label: "Fine-grained personal access token",
      help: "Create one under GitHub → Settings → Developer settings → Fine-grained tokens, with read access to Metadata, Issues, Pull requests, Commit statuses and Actions on the repositories you want here.",
      placeholder: "github_pat_…",
    },
  ],
  baseUrl: {
    label: "API URL",
    default: "https://api.github.com",
    placeholder: "https://github.example.com/api/v3",
  },
  verify: verifyGithubToken,
  records: {
    types: githubRecordTypes,
    filters: ["type", "includeClosed"],
    hint: {
      idle: "Involving you first, then recently updated. Type words, a number (482) or a repository name (web).",
      typing:
        "Matches words in titles and descriptions. Type a repository name to search only there.",
    },
    search: searchGithubRecords,
    url: githubRecordUrl,
  },
  guide,
});
