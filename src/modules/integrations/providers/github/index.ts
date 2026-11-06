import { defineProvider } from "../../contracts";
import { verifyGithubToken } from "./api";
import { githubRecords } from "./records";

/**
 * GitHub: connected with a fine-grained personal access token. Its repositories are sources; their
 * issues and pull requests are records, read live (ADR 0002, phase 3).
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
  records: {
    products: {
      github: {
        icon: "github",
        singular: "issue or PR",
        plural: "issues & PRs",
        listLabel: "Issues & PRs",
        hasBoard: true,
      },
    },
    reader: githubRecords,
  },
});
