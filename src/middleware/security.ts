import { Request, Response, NextFunction } from "express";

/**
 * Custom Security Headers Middleware (Alternative to Helmet for standard setups)
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "no-referrer-when-downgrade");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self' https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:ReferrerPolicy; connect-src 'self' https:;"
  );
  next();
}

/**
 * IP-based Rate Limiter sliding-window bucket implementation
 */
interface RateLimitBucket {
  count: number;
  resetTime: number;
}

const rateLimits = new Map<string, RateLimitBucket>();

export function rateLimiter(limit = 100, windowMs = 60000) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Treat dev/sim and loopback endpoints gracefully
    const ip = req.ip || req.headers["x-forwarded-for"] as string || "127.0.0.1";
    const now = Date.now();
    let bucket = rateLimits.get(ip);

    if (!bucket || now > bucket.resetTime) {
      bucket = { count: 0, resetTime: now + windowMs };
    }

    bucket.count++;
    rateLimits.set(ip, bucket);

    if (bucket.count > limit) {
      res.status(429).json({
        error: "Too Many Requests",
        message: `Too many requests from this client. Please wait before retrying. Cooldown reset in ${Math.ceil((bucket.resetTime - now) / 1000)}s.`,
      });
      return;
    }

    // Assign headers
    res.setHeader("X-RateLimit-Limit", limit);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, limit - bucket.count));
    res.setHeader("X-RateLimit-Reset", new Date(bucket.resetTime).toISOString());
    next();
  };
}

/**
 * Recursive input field sanitization helper
 */
function sanitizeValue(val: any): any {
  if (typeof val === "string") {
    // Remove potential script injection elements safely
    return val
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "[filtered-script]")
      .replace(/on\w+="[^"]*"/gi, "")
      .replace(/javascript:/gi, "[filtered-scheme]");
  }
  if (Array.isArray(val)) {
    return val.map(sanitizeValue);
  }
  if (val !== null && typeof val === "object") {
    const res: any = {};
    for (const key of Object.keys(val)) {
      res[key] = sanitizeValue(val[key]);
    }
    return res;
  }
  return val;
}

/**
 * Sanitizes input bodies to counter HTML/JS script injection attacks
 */
export function sanitizeInput(req: Request, res: Response, next: NextFunction) {
  if (req.body) {
    req.body = sanitizeValue(req.body);
  }
  next();
}

/**
 * Robust middleware validator schema wrapper
 */
export function validateIngestRequest(req: Request, res: Response, next: NextFunction) {
  const { source, rawText, url } = req.body;
  if (!source) {
    res.status(400).json({ error: "Validation Error", message: "Parameter 'source' is required." });
    return;
  }
  if (!rawText && !url) {
    res.status(400).json({ error: "Validation Error", message: "Parameter 'rawText' or clickable 'url' is required." });
    return;
  }
  next();
}
