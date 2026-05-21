import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, wishlistTable, productsTable, categoriesTable, reviewsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { usersTable } from "@workspace/db";

const router: IRouter = Router();

async function formatProductMinimal(product: typeof productsTable.$inferSelect) {
  const [reviewAgg] = await db
    .select({ avg: sql<string>`AVG(${reviewsTable.rating})`, count: sql<string>`COUNT(*)` })
    .from(reviewsTable).where(eq(reviewsTable.productId, product.id));
  const [cat] = product.categoryId
    ? await db.select().from(categoriesTable).where(eq(categoriesTable.id, product.categoryId))
    : [null];
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    price: parseFloat(product.price as string),
    originalPrice: product.originalPrice ? parseFloat(product.originalPrice as string) : null,
    images: (product.images as string[]) || [],
    category: cat?.name ?? "Merch",
    categoryId: product.categoryId ?? null,
    sizes: (product.sizes as string[]) || [],
    stock: product.stock,
    tags: (product.tags as string[]) || [],
    fabric: product.fabric ?? null,
    washCare: product.washCare ?? null,
    highlights: (product.highlights as string[]) || [],
    isFeatured: product.isFeatured,
    isBestseller: product.isBestseller,
    isLimitedEdition: product.isLimitedEdition,
    isNewArrival: product.isNewArrival,
    averageRating: reviewAgg.avg ? parseFloat(reviewAgg.avg) : null,
    reviewCount: parseInt(reviewAgg.count as string, 10) || 0,
    createdAt: product.createdAt.toISOString(),
  };
}

router.get("/wishlist", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = (req as Request & { user?: typeof usersTable.$inferSelect }).user!;
  const wishlist = await db.select({ productId: wishlistTable.productId }).from(wishlistTable).where(eq(wishlistTable.userId, user.id));
  const products = await Promise.all(
    wishlist.map(async (w) => {
      const [p] = await db.select().from(productsTable).where(eq(productsTable.id, w.productId));
      return p ? formatProductMinimal(p) : null;
    })
  );
  res.json(products.filter(Boolean));
});

router.post("/wishlist/:productId", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = (req as Request & { user?: typeof usersTable.$inferSelect }).user!;
  const raw = Array.isArray(req.params.productId) ? req.params.productId[0] : req.params.productId;
  const productId = parseInt(raw, 10);
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(wishlistTable).where(and(eq(wishlistTable.userId, user.id), eq(wishlistTable.productId, productId)));
  if (!existing) {
    await db.insert(wishlistTable).values({ userId: user.id, productId });
  }
  res.json({ message: "Added to wishlist" });
});

router.delete("/wishlist/:productId", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = (req as Request & { user?: typeof usersTable.$inferSelect }).user!;
  const raw = Array.isArray(req.params.productId) ? req.params.productId[0] : req.params.productId;
  const productId = parseInt(raw, 10);
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(wishlistTable).where(and(eq(wishlistTable.userId, user.id), eq(wishlistTable.productId, productId)));
  res.json({ message: "Removed from wishlist" });
});

export default router;
