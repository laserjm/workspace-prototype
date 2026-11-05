import { z } from "zod";
import { PROJECT_NAME_MAX_LENGTH } from "./domain/project";

/** The add-project form. The use case trims the name and refuses a blank one. */
export const createProjectInputSchema = z.object({
  name: z.string().max(PROJECT_NAME_MAX_LENGTH),
});
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;
