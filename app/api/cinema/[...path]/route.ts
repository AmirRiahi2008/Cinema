import { env } from "cloudflare:workers";
import { handleCinemaRequest } from "@/lib/cinema-server";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
async function handle(request: Request, context: Context) {
  const { path } = await context.params;
  return handleCinemaRequest(request, env as unknown as { DB: D1Database; BUCKET: R2Bucket }, path);
}
export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
export const OPTIONS = handle;
