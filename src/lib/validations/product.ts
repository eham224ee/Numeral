import { z } from "zod";

export const createProductSchema = z.object({
  title: z.string().min(1, "Title is required"),
  slug: z.string().min(1, "Slug is required"),
  description: z.string().optional(),
  categoryId: z.string().uuid("Invalid Category ID").nullable().optional(),
  basePrice: z.number().positive("Base price must be positive"),
  imageUrl: z.string().url().optional(),
  // Dynamic technical specifications (e.g., { wattage: 65, Bluetooth: "5.3" })
  specs: z.record(z.string(), z.any()).default({}),
  // Dynamic options (e.g., [{ name: "Color", values: ["Black", "Silver"] }])
  options: z
    .array(
      z.object({
        name: z.string().min(1),
        values: z.array(z.string().min(1)).min(1),
      })
    )
    .default([]),
  // Concrete SKUs / Variants generated from option permutations
  variants: z
    .array(
      z.object({
        sku: z.string().min(1, "SKU is required"),
        price: z.number().positive("Price must be positive"),
        stock: z.number().int().nonnegative().default(0),
        imageUrl: z.string().url().optional(),
        options: z.record(z.string(), z.string()), // e.g., { "Color": "Black" }
      })
    )
    .min(1, "At least one variant is required"),
});