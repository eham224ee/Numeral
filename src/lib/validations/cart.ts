import { z } from "zod";

export const addToCartSchema = z.object({
  variantId: z.string().uuid("Invalid Variant ID"),
  quantity: z.number().int().positive("Quantity must be at least 1").default(1),
});

export const updateCartItemSchema = z.object({
  quantity: z.number().int().positive("Quantity must be at least 1"),
});