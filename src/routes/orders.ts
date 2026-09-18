import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "../db";
import {
  carts,
  cartItems,
  orders,
  orderItems,
  productVariants,
  user as userTable,
} from "../db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { createOrderSchema, updateOrderStatusSchema } from "../lib/validations/order";
import { requireAdmin } from "../middlewares/admin";

type Env = {
  Variables: {
    user: typeof userTable.$inferSelect | null;
  };
};

const app = new Hono<Env>();

// ============================================================================
// POST /api/orders/checkout - Convert Cart to Order (Atomic Transaction)
// ============================================================================
app.post("/checkout", zValidator("json", createOrderSchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = c.req.valid("json");

  // Run the full checkout flow inside a database transaction
  const orderResult = await db.transaction(async (tx) => {
    // 1. Fetch user's active cart
    const userCart = await tx.query.carts.findFirst({
      where: eq(carts.userId, user.id),
    });

    if (!userCart) {
      throw new Error("CART_EMPTY");
    }

    // 2. Fetch cart items with product variants
    const items = await tx.query.cartItems.findMany({
      where: eq(cartItems.cartId, userCart.id),
      with: {
        variant: true,
      },
    });

    if (items.length === 0) {
      throw new Error("CART_EMPTY");
    }

    // 3. Verify stock and calculate total amount
    let totalAmount = 0;

    for (const item of items) {
      if (item.variant.stock < item.quantity) {
        throw new Error(
          `INSUFFICIENT_STOCK:${item.variant.sku}:${item.variant.stock}`
        );
      }
      const itemPrice = parseFloat(item.variant.price);
      totalAmount += itemPrice * item.quantity;
    }

    // 4. Create Order Record
    const [newOrder] = await tx
      .insert(orders)
      .values({
        id: crypto.randomUUID(), // <--- Supply ID explicitly
        userId: user.id,
        totalAmount: totalAmount.toFixed(2),
        status: "pending",
        shippingAddress: body.shippingAddress,
      })
      .returning();

    // 5. Create Order Items (snapshotting current variant price) & Decrement Stock
    for (const item of items) {
      await tx.insert(orderItems).values({
        orderId: newOrder.id,
        variantId: item.variantId,
        quantity: item.quantity,
        priceAtPurchase: item.variant.price, // Snapshot price
      });

      // Atomic stock decrement
      await tx
        .update(productVariants)
        .set({
          stock: sql`${productVariants.stock} - ${item.quantity}`,
        })
        .where(eq(productVariants.id, item.variantId));
    }

    // 6. Clear user's cart items
    await tx.delete(cartItems).where(eq(cartItems.cartId, userCart.id));

    return newOrder;
  }).catch((err: Error) => {
    if (err.message === "CART_EMPTY") {
      return { error: "Cart is empty", status: 400 as const };
    }
    if (err.message.startsWith("INSUFFICIENT_STOCK")) {
      const [, sku, stock] = err.message.split(":");
      return {
        error: `Variant ${sku} has insufficient stock (Available: ${stock})`,
        status: 400 as const,
      };
    }
    throw err;
  });

  if ("error" in orderResult) {
    return c.json({ error: orderResult.error }, orderResult.status);
  }

  return c.json({ data: orderResult }, 201);
});

// ============================================================================
// GET /api/orders - List Current User's Orders
// ============================================================================
app.get("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const userOrders = await db.query.orders.findMany({
    where: eq(orders.userId, user.id),
    with: {
      items: {
        with: {
          variant: {
            with: {
              product: true,
            },
          },
        },
      },
    },
    orderBy: [desc(orders.createdAt)],
  });

  return c.json({ data: userOrders });
});

// ============================================================================
// GET /api/orders/:id - Get Specific Order Details
// ============================================================================
app.get("/:id", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const orderId = c.req.param("id");

  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    with: {
      items: {
        with: {
          variant: {
            with: {
              product: true,
            },
          },
        },
      },
    },
  });

  if (!order) {
    return c.json({ error: "Order not found" }, 404);
  }

  // Ensure user owns the order (or is an admin)
  if (order.userId !== user.id && user.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }

  return c.json({ data: order });
});

// ============================================================================
// PATCH /api/orders/:id/status - Admin Update Order Status
// ============================================================================
app.patch(
  "/:id/status",
  requireAdmin,
  zValidator("json", updateOrderStatusSchema),
  async (c) => {
    const orderId = c.req.param("id");
    const { status } = c.req.valid("json");

    const [updatedOrder] = await db
      .update(orders)
      .set({ status })
      .where(eq(orders.id, orderId))
      .returning();

    if (!updatedOrder) {
      return c.json({ error: "Order not found" }, 404);
    }

    return c.json({ data: updatedOrder });
  }
);

export default app;