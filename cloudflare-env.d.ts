declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    CINEMA_FRONTEND_ORIGINS?: string;
  }
}
