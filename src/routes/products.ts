import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "../db";
import { products, productOptions, productVariants } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAdmin } from "../middlewares/admin";
import { createProductSchema } from "../lib/validations/product";

const app = new Hono();

// ============================================================================
// PUBLIC: GET /api/products (Catalog List)
// ============================================================================
app.get("/", async (c) => {
  const allProducts = await db.query.products.findMany({
    with: {
      category: true,
      variants: true,
    },
    orderBy: [desc(products.createdAt)],
  });

  return c.json({ data: allProducts });
});

// ============================================================================
// PUBLIC: GET /api/products/:slug (Detailed Product View)
// ============================================================================
app.get("/:slug", async (c) => {
  const slug = c.req.param("slug");

  const product = await db.query.products.findFirst({
    where: eq(products.slug, slug),
    with: {
      category: true,
      options: true,
      variants: true,
    },
  });

  if (!product) {
    return c.json({ error: "Product not found" }, 404);
  }

  return c.json({ data: product });
});

// ============================================================================
// ADMIN: POST /api/products (Create Product, Options & Variants)
// ============================================================================
app.post("/", requireAdmin, zValidator("json", createProductSchema), async (c) => {
  const body = c.req.valid("json");

  // Execute in a single atomic transaction
  const result = await db.transaction(async (tx) => {
    // 1. Insert Base Product
    const [newProduct] = await tx
      .insert(products)
      .values({
        title: body.title,
        slug: body.slug,
        description: body.description,
        categoryId: body.categoryId ?? null,
        basePrice: body.basePrice.toString(),
        imageUrl: body.imageUrl,
        specs: body.specs,
      })
      .returning();

    // 2. Insert Options (if provided)
    if (body.options.length > 0) {
      await tx.insert(productOptions).values(
        body.options.map((opt) => ({
          productId: newProduct.id,
          name: opt.name,
          values: opt.values,
        }))
      );
    }

    // 3. Insert Variants
    const createdVariants = await tx
      .insert(productVariants)
      .values(
        body.variants.map((variant) => ({
          productId: newProduct.id,
          sku: variant.sku,
          price: variant.price.toString(),
          stock: variant.stock,
          imageUrl: variant.imageUrl,
          options: variant.options,
        }))
      )
      .returning();

    return {
      ...newProduct,
      variants: createdVariants,
    };
  });

  return c.json({ data: result }, 201);
});

export default app;