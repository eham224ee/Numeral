import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "../db";
import { categories } from "../db/schema";
import { eq, asc, isNull } from "drizzle-orm";
import { createCategorySchema, updateCategorySchema } from "../lib/validations/category";
import { requireAdmin } from "../middlewares/admin";

const app = new Hono();

// ============================================================================
// PUBLIC: GET /api/categories/nav (Nested Navigation Tree)
// ============================================================================
app.get("/nav", async (c) => {
  // Fetch all categories enabled for navigation, ordered by displayOrder
  const allNavCategories = await db.query.categories.findMany({
    where: eq(categories.isNavVisible, true),
    orderBy: [asc(categories.displayOrder)],
  });

  // Map to build hierarchical parent -> children tree
  type CategoryNode = typeof categories.$inferSelect & { children: CategoryNode[] };
  const categoryMap = new Map<string, CategoryNode>();
  const rootCategories: CategoryNode[] = [];

  // Initialize nodes
  for (const cat of allNavCategories) {
    categoryMap.set(cat.id, { ...cat, children: [] });
  }

  // Build tree
  for (const cat of allNavCategories) {
    const node = categoryMap.get(cat.id)!;
    if (cat.parentId && categoryMap.has(cat.parentId)) {
      categoryMap.get(cat.parentId)!.children.push(node);
    } else if (!cat.parentId) {
      rootCategories.push(node);
    }
  }

  return c.json({ data: rootCategories });
});

// ============================================================================
// PUBLIC: GET /api/categories (Flat List)
// ============================================================================
app.get("/", async (c) => {
  const list = await db.query.categories.findMany({
    orderBy: [asc(categories.displayOrder)],
  });
  return c.json({ data: list });
});

// ============================================================================
// ADMIN: POST /api/categories (Create Category)
// ============================================================================
app.post("/", requireAdmin, zValidator("json", createCategorySchema), async (c) => {
  const body = c.req.valid("json");

  const [newCategory] = await db
    .insert(categories)
    .values({
      name: body.name,
      slug: body.slug,
      description: body.description,
      parentId: body.parentId ?? null,
      isNavVisible: body.isNavVisible,
      displayOrder: body.displayOrder,
    })
    .returning();

  return c.json({ data: newCategory }, 201);
});

// ============================================================================
// ADMIN: PUT /api/categories/:id (Update Category)
// ============================================================================
app.put("/:id", requireAdmin, zValidator("json", updateCategorySchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const [updated] = await db
    .update(categories)
    .set(body)
    .where(eq(categories.id, id))
    .returning();

  if (!updated) {
    return c.json({ error: "Category not found" }, 404);
  }

  return c.json({ data: updated });
});

// ============================================================================
// ADMIN: DELETE /api/categories/:id (Delete Category)
// ============================================================================
app.delete("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");

  const [deleted] = await db
    .delete(categories)
    .where(eq(categories.id, id))
    .returning();

  if (!deleted) {
    return c.json({ error: "Category not found" }, 404);
  }

  return c.json({ message: "Category deleted successfully" });
});

export default app;