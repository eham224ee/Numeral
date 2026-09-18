import type { NotFoundHandler, ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";

// ============================================================================
// 1. 404 Not Found Handler
// ============================================================================
export const notFoundHandler: NotFoundHandler = (c) => {
  return c.json(
    {
      error: {
        code: "NOT_FOUND",
        message: `Route ${c.req.method} ${c.req.path} not found`,
      },
    },
    404
  );
};

// ============================================================================
// 2. Global Runtime Error Handler
// ============================================================================
export const errorHandler: ErrorHandler = (err, c) => {
  console.error(`[API Error] ${c.req.method} ${c.req.path}:`, err);

  // Handle Hono HTTP Exceptions (e.g., c.notFound(), throw new HTTPException)
  if (err instanceof HTTPException) {
    return c.json(
      {
        error: {
          code: `HTTP_${err.status}`,
          message: err.message || "An HTTP error occurred",
        },
      },
      err.status
    );
  }

  // Handle Zod Validation Errors
  if (err instanceof ZodError) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request payload",
          details: err.flatten().fieldErrors,
        },
      },
      400
    );
  }

  // Default: 500 Internal Server Error (Hide raw internal details in production)
  const isProduction = process.env.NODE_ENV === "production";

  return c.json(
    {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: isProduction
          ? "An unexpected internal error occurred."
          : err.message,
      },
    },
    500
  );
};