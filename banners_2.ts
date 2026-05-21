import { Router, type IRouter, type Request, type Response } from "express";
import { eq, asc } from "drizzle-orm";
import { db, bannersTable } from "@workspace/db";
import { CreateBannerBody, UpdateBannerBody } from "@workspace/api-zod";
import { requireAuth, requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

function formatBanner(b: typeof bannersTable.$inferSelect) {
  return {
    id: b.id,
    title: b.title,
    subtitle: b.subtitle ?? null,
    image: b.image,
    link: b.link ?? null,
    cta: b.cta ?? null,
    position: b.position as "hero" | "promo" | "collection",
    isActive: b.isActive,
    sortOrder: b.sortOrder,
  };
}

router.get("/banners", async (_req: Request, res: Response): Promise<void> => {
  const banners = await db.select().from(bannersTable).where(eq(bannersTable.isActive, true)).orderBy(asc(bannersTable.sortOrder));
  res.json(banners.map(formatBanner));
});

router.post("/banners", requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateBannerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [banner] = await db.insert(bannersTable).values({
    ...parsed.data,
    isActive: parsed.data.isActive ?? true,
    sortOrder: parsed.data.sortOrder ?? 0,
  }).returning();
  res.status(201).json(formatBanner(banner));
});

router.patch("/banners/:id", requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateBannerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [banner] = await db.update(bannersTable).set(parsed.data).where(eq(bannersTable.id, id)).returning();
  if (!banner) { res.status(404).json({ error: "Banner not found" }); return; }
  res.json(formatBanner(banner));
});

router.delete("/banners/:id", requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(bannersTable).where(eq(bannersTable.id, id));
  res.sendStatus(204);
});

export default router;
