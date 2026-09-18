import { z } from "zod";

export const createCategorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required"),
  description: z.string().optional(),
  parentId: z.string().uuid("Invalid Parent UUID").nullable().optional(),
  isNavVisible: z.boolean().default(true),
  displayOrder: z.number().int().default(0),
});

export const updateCategorySchema = createCategorySchema.partial();