import {
  defineProvider,
  type Connection,
  type SourceSummary,
} from "../../contracts";
import { sampleSources, type SampleSource } from "./data";

const summaryOf = ({
  id,
  name,
  description,
  workspace,
  location,
  collection,
  collectionPath,
  overviewTitle,
}: SampleSource): SourceSummary => ({
  key: id,
  product: id,
  name,
  description,
  workspace,
  location,
  collection,
  collectionPath,
  overviewTitle,
});

const sourceByKey = (key: string) =>
  sampleSources.find((source) => source.id === key);

/**
 * Fictional Jira, Confluence and codebeamer records bundled with the prototype. Every user has
 * its connection, so the workspace runs without accounts, and the sample takes the same path as
 * a live provider.
 */
export const sample = defineProvider({
  id: "sample",
  name: "Sample data",
  description: "Fictional enterprise records to try the workspace with",
  auth: [{ kind: "none" }],
  records: {
    products: Object.fromEntries(
      sampleSources.map((source) => [
        source.id,
        {
          icon: source.id,
          singular: source.singular,
          plural: source.plural,
          listLabel: source.listLabel,
          hasBoard: source.hasBoard,
        },
      ]),
    ),
    reader: {
      async listSources() {
        return sampleSources.map(summaryOf);
      },
      async searchRecords(_access, sourceKey, { text }) {
        const source = sourceByKey(sourceKey);
        if (!source) return undefined;
        const words = text?.trim().toLowerCase();
        // Small enough for one page.
        return {
          records: words
            ? source.records.filter((record) =>
                `${record.id} ${record.title} ${record.owner}`
                  .toLowerCase()
                  .includes(words),
              )
            : source.records,
        };
      },
      async getRecords(_access, sourceKey, ids) {
        return (
          sourceByKey(sourceKey)?.records.filter((record) =>
            ids.includes(record.id),
          ) ?? []
        );
      },
    },
  },
});


/** The built-in connection to the sample provider, which every user has. Stored nowhere. */
export const sampleConnection: Connection = {
  id: "sample",
  providerId: sample.id,
  accountLabel: "Sample data",
  builtIn: true,
  status: "active",
  baseUrl: "",
  scopes: [],
  expiresAt: null,
  lastVerifiedAt: null,
};
