// Sliding-window rate limiter, in-memory per serverless instance.
// Not a hard guarantee across instances — pair with a Vercel WAF rule
// for real abuse protection — but stops naive request loops cheaply.
const WINDOW_MS = 60_000;
const MAX_TRACKED_IPS = 5_000;

const buckets = new Map<string, number[]>();

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

export function rateLimit(ip: string, limit: number): boolean {
  const now = Date.now();

  if (buckets.size > MAX_TRACKED_IPS) {
    for (const [key, hits] of buckets) {
      if (hits.every(t => now - t >= WINDOW_MS)) buckets.delete(key);
    }
  }

  const hits = (buckets.get(ip) ?? []).filter(t => now - t < WINDOW_MS);
  if (hits.length >= limit) {
    buckets.set(ip, hits);
    return false;
  }
  hits.push(now);
  buckets.set(ip, hits);
  return true;
}
