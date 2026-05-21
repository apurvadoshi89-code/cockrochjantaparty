import { Router, type IRouter, type Request, type Response } from "express";
import { db, couponsTable } from "@workspace/db";
import { CreateCouponBody } from "@workspace/api-zod";
import { requireAuth, requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

function formatCoupon(c: typeof couponsTable.$inferSelect) {
  return {
    id: c.id,
    code: c.code,
    discountType: c.discountType as "percentage" | "flat",
    discountValue: parseFloat(c.discountValue as string),
    minOrderAmount: c.minOrderAmount ? parseFloat(c.minOrderAmount as string) : null,
    maxUses: c.maxUses ?? null,
    usedCount: c.usedCount,
    isActive: c.isActive,
    expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
  };
}

router.get("/coupons", requireAuth, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const coupons = await db.select().from(couponsTable);
  res.json(coupons.map(formatCoupon));
});

router.post("/coupons", requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateCouponBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [coupon] = await db.insert(couponsTable).values({
    code: parsed.data.code.toUpperCase(),
    discountType: parsed.data.discountType,
    discountValue: String(parsed.data.discountValue),
    minOrderAmount: parsed.data.minOrderAmount != null ? String(parsed.data.minOrderAmount) : null,
    maxUses: parsed.data.maxUses ?? null,
    isActive: parsed.data.isActive ?? true,
    expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
  }).returning();
  res.status(201).json(formatCoupon(coupon));
});

export default router;
