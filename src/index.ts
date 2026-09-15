import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { auth } from "./lib/auth";
import productRoutes from "./routes/products";

const app = new Hono();

app.use("*", cors());

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.route("/api/products", productRoutes);
serve(app);