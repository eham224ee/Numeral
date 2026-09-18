import { createMiddleware } from "hono/factory";

export const requireAdmin = createMiddleware(async (c, next) => {
  const user = c.get("user"); // Set by Better-Auth middleware

  if (!user || user.role !== "admin") {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }

  await next();
});