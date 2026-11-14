import { signOut } from "@/lib/auth/handlers";

// POST only: a link or an image tag cannot sign anyone out.
export const POST = signOut;
