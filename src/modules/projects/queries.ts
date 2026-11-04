import "server-only";
import { sampleProjectCatalog } from "./infra/sample.project-catalog";

/** The signed-in user's projects. Sample data until projects are stored per owner. */
export async function listProjects(): Promise<string[]> {
  return sampleProjectCatalog;
}
