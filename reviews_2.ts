import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, reviewsTable, usersTable, productsTable } from "@workspace/db";
import { CreateReviewBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/products/:id/reviews", async (req: Request, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const reviews = await db.select({
    id: reviewsTable.id,
    productId: reviewsTable.productId,
    userId: reviewsTable.userId,
    rating: reviewsTable.rating,
    comment: reviewsTable.comment,
    createdAt: reviewsTable.createdAt,
    userName: usersTable.name,
  }).from(reviewsTable)
    .leftJoin(usersTable, eq(reviewsTable.userId, usersTable.id))
    .where(eq(reviewsTable.productId, id));

  res.json(reviews.map(r => ({
    id: r.id,
    productId: r.productId,
    userId: r.userId,
    userName: r.userName ?? "Anonymous",
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt.toISOString(),
  })));
});

router.post("/products/:id/reviews", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const user = (req as Request & { user?: typeof usersTable.$inferSelect }).user!;

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  const parsed = CreateReviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [review] = await db.insert(reviewsTable).values({
    productId: id,
    userId: user.id,
    rating: parsed.data.rating,
    comment: parsed.data.comment,
  }).returning();

  res.status(201).json({
    id: review.id,
    productId: review.productId,
    userId: review.userId,
    userName: user.name,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt.toISOString(),
  });
});

export default router;
