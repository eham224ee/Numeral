import { Hono } from "hono";
import { db } from "../db";
import { products } from "../db/schema";
import { requireAuth } from "../middlewares/auth";

const app = new Hono();

// Public route: Fetch all products
app.get("/", async (c) => {
  const allProducts = await db.select().from(products);
  return c.json(allProducts);
});

// Protected route: Add new product (Requires active Auth session)
app.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json();

  const newProduct = await db
    .insert(products)
    .values({
      title: body.title,
      slug: body.slug,
      price: body.price,
      description: body.description,
      stock: body.stock,
    })
    .returning();

  return c.json({ message: "Product created", product: newProduct[0], createdBy: user.email }, 201);
});

export default app;