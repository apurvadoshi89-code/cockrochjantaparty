import { Router, type IRouter, type Request, type Response } from "express";
import { db, categoriesTable, productsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { CreateCategoryBody } from "@workspace/api-zod";
import { requireAuth, requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/categories", async (_req: Request, res: Response): Promise<void> => {
  const cats = await db.select().from(categoriesTable);
  const result = await Promise.all(cats.map(async (c) => {
    const [count] = await db.select({ count: sql<string>`COUNT(*)` }).from(productsTable).where(eq(productsTable.categoryId, c.id));
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      image: c.image ?? null,
      productCount: parseInt(count.count, 10) || 0,
    };
  }));
  res.json(result);
});

router.post("/categories", requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [cat] = await db.insert(categoriesTable).values(parsed.data).returning();
  res.status(201).json({ id: cat.id, name: cat.name, slug: cat.slug, image: cat.image ?? null, productCount: 0 });
});

export default router;
