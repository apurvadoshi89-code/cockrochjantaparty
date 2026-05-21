import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and } from "drizzle-orm";
import { db, cartSessionsTable, cartItemsTable, productsTable, couponsTable } from "@workspace/db";
import { AddToCartBody, UpdateCartItemBody, ApplyCouponBody } from "@workspace/api-zod";
import { optionalAuth } from "../middlewares/auth";
import crypto from "crypto";

const router: IRouter = Router();

function getSessionId(req: Request): string {
  const user = (req as Request & { user?: { id: number } }).user;
  if (user) return `user_${user.id}`;
  const sessionHeader = req.headers["x-session-id"] as string;
  return sessionHeader || `guest_${crypto.randomUUID()}`;
}

async function getOrCreateSession(sessionId: string, userId?: number) {
  let [session] = await db.select().from(cartSessionsTable).where(eq(cartSessionsTable.sessionId, sessionId));
  if (!session) {
    [session] = await db.insert(cartSessionsTable).values({ sessionId, userId: userId ?? null }).returning();
  }
  return session;
}

async function buildCartResponse(sessionId: string) {
  const [session] = await db.select().from(cartSessionsTable).where(eq(cartSessionsTable.sessionId, sessionId));
  if (!session) {
    return { items: [], subtotal: 0, discount: 0, couponCode: null, deliveryCharge: 0, total: 0, itemCount: 0 };
  }

  const items = await db.select({
    id: cartItemsTable.id,
    productId: cartItemsTable.productId,
    size: cartItemsTable.size,
    quantity: cartItemsTable.quantity,
    price: cartItemsTable.price,
  }).from(cartItemsTable).where(eq(cartItemsTable.cartSessionId, session.id));

  const itemsWithProducts = await Promise.all(items.map(async (item) => {
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
    return {
      id: item.id,
      productId: item.productId,
      product: product ? {
        id: product.id,
        name: product.name,
        slug: product.slug,
        description: product.description,
        price: parseFloat(product.price as string),
        originalPrice: product.originalPrice ? parseFloat(product.originalPrice as string) : null,
        images: (product.images as string[]) || [],
        category: "Merch",
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
        averageRating: null,
        reviewCount: 0,
        createdAt: product.createdAt.toISOString(),
      } : null,
      size: item.size,
      quantity: item.quantity,
      price: parseFloat(item.price as string),
    };
  }));

  const subtotal = itemsWithProducts.reduce((sum, i) => sum + i.price * i.quantity, 0);
  let discount = 0;

  if (session.couponCode) {
    const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, session.couponCode));
    if (coupon && coupon.isActive) {
      const minAmt = coupon.minOrderAmount ? parseFloat(coupon.minOrderAmount as string) : 0;
      if (subtotal >= minAmt) {
        if (coupon.discountType === "percentage") {
          discount = subtotal * (parseFloat(coupon.discountValue as string) / 100);
        } else {
          discount = parseFloat(coupon.discountValue as string);
        }
      }
    }
  }

  const deliveryCharge = subtotal > 499 ? 0 : 59;
  const total = Math.max(0, subtotal - discount + deliveryCharge);
  const itemCount = itemsWithProducts.reduce((sum, i) => sum + i.quantity, 0);

  return {
    items: itemsWithProducts,
    subtotal: Math.round(subtotal * 100) / 100,
    discount: Math.round(discount * 100) / 100,
    couponCode: session.couponCode ?? null,
    deliveryCharge,
    total: Math.round(total * 100) / 100,
    itemCount,
  };
}

router.get("/cart", optionalAuth, async (req: Request, res: Response): Promise<void> => {
  const sessionId = getSessionId(req);
  const cart = await buildCartResponse(sessionId);
  res.json(cart);
});

router.post("/cart/items", optionalAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = AddToCartBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const user = (req as Request & { user?: { id: number } }).user;
  const sessionId = getSessionId(req);
  const session = await getOrCreateSession(sessionId, user?.id);

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, parsed.data.productId));
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const [existingItem] = await db.select().from(cartItemsTable).where(
    and(
      eq(cartItemsTable.cartSessionId, session.id),
      eq(cartItemsTable.productId, parsed.data.productId),
      eq(cartItemsTable.size, parsed.data.size)
    )
  );

  if (existingItem) {
    await db.update(cartItemsTable)
      .set({ quantity: existingItem.quantity + parsed.data.quantity })
      .where(eq(cartItemsTable.id, existingItem.id));
  } else {
    await db.insert(cartItemsTable).values({
      cartSessionId: session.id,
      productId: parsed.data.productId,
      size: parsed.data.size,
      quantity: parsed.data.quantity,
      price: product.price,
    });
  }

  res.json(await buildCartResponse(sessionId));
});

router.patch("/cart/items/:itemId", optionalAuth, async (req: Request, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId;
  const itemId = parseInt(raw, 10);
  if (isNaN(itemId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateCartItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const sessionId = getSessionId(req);
  if (parsed.data.quantity <= 0) {
    await db.delete(cartItemsTable).where(eq(cartItemsTable.id, itemId));
  } else {
    await db.update(cartItemsTable).set({ quantity: parsed.data.quantity }).where(eq(cartItemsTable.id, itemId));
  }

  res.json(await buildCartResponse(sessionId));
});

router.delete("/cart/items/:itemId", optionalAuth, async (req: Request, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId;
  const itemId = parseInt(raw, 10);
  if (isNaN(itemId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const sessionId = getSessionId(req);
  await db.delete(cartItemsTable).where(eq(cartItemsTable.id, itemId));
  res.json(await buildCartResponse(sessionId));
});

router.delete("/cart", optionalAuth, async (req: Request, res: Response): Promise<void> => {
  const sessionId = getSessionId(req);
  const [session] = await db.select().from(cartSessionsTable).where(eq(cartSessionsTable.sessionId, sessionId));
  if (session) {
    await db.delete(cartItemsTable).where(eq(cartItemsTable.cartSessionId, session.id));
  }
  res.json({ message: "Cart cleared" });
});

router.post("/cart/coupon", optionalAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = ApplyCouponBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, parsed.data.code.toUpperCase()));
  if (!coupon || !coupon.isActive) {
    res.status(400).json({ error: "Invalid or expired coupon" });
    return;
  }

  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    res.status(400).json({ error: "Coupon has expired" });
    return;
  }

  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
    res.status(400).json({ error: "Coupon usage limit reached" });
    return;
  }

  const sessionId = getSessionId(req);
  const user = (req as Request & { user?: { id: number } }).user;
  const session = await getOrCreateSession(sessionId, user?.id);
  await db.update(cartSessionsTable).set({ couponCode: coupon.code }).where(eq(cartSessionsTable.id, session.id));

  res.json(await buildCartResponse(sessionId));
});

export { buildCartResponse, getSessionId, getOrCreateSession };
export default router;
