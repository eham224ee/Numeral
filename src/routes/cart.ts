import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "../db";
import { carts, cartItems, productVariants, user as userTable } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { addToCartSchema, updateCartItemSchema } from "../lib/validations/cart";

// Define context variables for Hono
type Env = {
  Variables: {
    user: typeof userTable.$inferSelect | null;
  };
};

const app = new Hono<Env>();

// Helper: Get or create cart for current logged-in user
async function getOrCreateCart(userId: string) {
  let userCart = await db.query.carts.findFirst({
    where: eq(carts.userId, userId),
  });

  if (!userCart) {
    const [newCart] = await db
      .insert(carts)
      .values({ userId })
      .returning();
    userCart = newCart;
  }

  return userCart;
}

// ============================================================================
// GET /api/cart - Retrieve Current User's Cart
// ============================================================================
app.get("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const userCart = await getOrCreateCart(user.id);

  const items = await db.query.cartItems.findMany({
    where: eq(cartItems.cartId, userCart.id),
    with: {
      variant: {
        with: {
          product: true,
        },
      },
    },
  });

  return c.json({
    data: {
      cartId: userCart.id,
      items,
    },
  });
});

// ============================================================================
// POST /api/cart/items - Add Variant to Cart (With Stock Check)
// ============================================================================
app.post("/items", zValidator("json", addToCartSchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { variantId, quantity } = c.req.valid("json");

  const variant = await db.query.productVariants.findFirst({
    where: eq(productVariants.id, variantId),
  });

  if (!variant) {
    return c.json({ error: "Product variant not found" }, 404);
  }

  const userCart = await getOrCreateCart(user.id);

  const existingItem = await db.query.cartItems.findFirst({
    where: and(
      eq(cartItems.cartId, userCart.id),
      eq(cartItems.variantId, variantId)
    ),
  });

  const targetQuantity = existingItem
    ? existingItem.quantity + quantity
    : quantity;

  if (targetQuantity > variant.stock) {
    return c.json(
      {
        error: `Insufficient stock. Requested: ${targetQuantity}, Available: ${variant.stock}`,
      },
      400
    );
  }

  if (existingItem) {
    const [updated] = await db
      .update(cartItems)
      .set({ quantity: targetQuantity })
      .where(eq(cartItems.id, existingItem.id))
      .returning();

    return c.json({ data: updated });
  }

  const [newItem] = await db
    .insert(cartItems)
    .values({
      cartId: userCart.id,
      variantId,
      quantity,
    })
    .returning();

  return c.json({ data: newItem }, 201);
});

// ============================================================================
// PATCH /api/cart/items/:id - Update Item Quantity
// ============================================================================
app.patch("/items/:id", zValidator("json", updateCartItemSchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const itemId = c.req.param("id");
  const { quantity } = c.req.valid("json");

  const item = await db.query.cartItems.findFirst({
    where: eq(cartItems.id, itemId),
    with: { variant: true },
  });

  if (!item) {
    return c.json({ error: "Cart item not found" }, 404);
  }

  if (quantity > item.variant.stock) {
    return c.json(
      {
        error: `Insufficient stock. Requested: ${quantity}, Available: ${item.variant.stock}`,
      },
      400
    );
  }

  const [updated] = await db
    .update(cartItems)
    .set({ quantity })
    .where(eq(cartItems.id, itemId))
    .returning();

  return c.json({ data: updated });
});

// ============================================================================
// DELETE /api/cart/items/:id - Remove Item from Cart
// ============================================================================
app.delete("/items/:id", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const itemId = c.req.param("id");

  const [deleted] = await db
    .delete(cartItems)
    .where(eq(cartItems.id, itemId))
    .returning();

  if (!deleted) {
    return c.json({ error: "Cart item not found" }, 404);
  }

  return c.json({ message: "Item removed from cart" });
});

export default app;