import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { auth } from "./lib/auth";
import productRoutes from "./routes/products";
import categoriesRouter from "./routes/categories";
import cartRouter from "./routes/cart";
import ordersRouter from "./routes/orders";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler";

// Define the environment type for Hono context
type Env = {
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
  };
};

export const app = new Hono<Env>();

app.use("*", cors());

// Authentication Middleware: Attach session & user to c.var
app.use("*", async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (session) {
    c.set("user", session.user);
    c.set("session", session.session);
  } else {
    c.set("user", null);
    c.set("session", null);
  }

  await next();
});

// Better-Auth handler endpoint
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// Application Routes
app.route("/api/products", productRoutes);
app.route("/api/categories", categoriesRouter);
app.route("/api/cart", cartRouter);
app.route("/api/orders", ordersRouter);

app.notFound(notFoundHandler);
app.onError(errorHandler);

serve(app);
