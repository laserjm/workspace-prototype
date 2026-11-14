import "server-only";
import { handleAuthRequest } from "@/lib/auth/handlers";

export const GET = handleAuthRequest;
export const POST = handleAuthRequest;
