import { Router, type IRouter, type Request, type Response } from "express";
import { db, ordersTable, productsTable, usersTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/admin/analytics", requireAuth, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    revenueResult,
    totalOrders,
    totalProducts,
    totalUsers,
    pendingOrders,
    revenueToday,
    ordersToday,
    ordersByStatus,
    recentOrders,
    topProductsRaw,
  ] = await Promise.all([
    db.select({ total: sql<string>`SUM(total::numeric)` }).from(ordersTable),
    db.select({ count: sql<string>`COUNT(*)` }).from(ordersTable),
    db.select({ count: sql<string>`COUNT(*)` }).from(productsTable),
    db.select({ count: sql<string>`COUNT(*)` }).from(usersTable),
    db.select({ count: sql<string>`COUNT(*)` }).from(ordersTable).where(eq(ordersTable.status, "pending")),
    db.select({ total: sql<string>`SUM(total::numeric)` }).from(ordersTable).where(sql`created_at >= ${today}`),
    db.select({ count: sql<string>`COUNT(*)` }).from(ordersTable).where(sql`created_at >= ${today}`),
    db.select({ status: ordersTable.status, count: sql<string>`COUNT(*)` }).from(ordersTable).groupBy(ordersTable.status),
    db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt)).limit(5),
    db.select().from(ordersTable).limit(100),
  ]);

  // Calculate top products from orders
  const productSales: Record<number, { name: string; sold: number; revenue: number }> = {};
  for (const order of topProductsRaw) {
    const items = order.items as Array<{ productId: number; productName: string; quantity: number; price: number }>;
    for (const item of items) {
      if (!productSales[item.productId]) {
        productSales[item.productId] = { name: item.productName, sold: 0, revenue: 0 };
      }
      productSales[item.productId].sold += item.quantity;
      productSales[item.productId].revenue += item.price * item.quantity;
    }
  }

  const topProducts = Object.entries(productSales)
    .sort(([, a], [, b]) => b.sold - a.sold)
    .slice(0, 5)
    .map(([id, data]) => ({
      productId: parseInt(id, 10),
      productName: data.name,
      totalSold: data.sold,
      revenue: Math.round(data.revenue * 100) / 100,
    }));

  function formatOrderSimple(order: typeof ordersTable.$inferSelect) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId ?? null,
      items: (order.items as Array<{ productId: number; productName: string; productImage: string; size: string; quantity: number; price: number }>).map((item, idx) => ({ id: idx + 1, ...item })),
      address: order.address,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      subtotal: parseFloat(order.subtotal as string),
      discount: parseFloat(order.discount as string),
      deliveryCharge: parseFloat(order.deliveryCharge as string),
      total: parseFloat(order.total as string),
      couponCode: order.couponCode ?? null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  res.json({
    totalRevenue: parseFloat(revenueResult[0].total ?? "0"),
    totalOrders: parseInt(totalOrders[0].count, 10),
    totalProducts: parseInt(totalProducts[0].count, 10),
    totalUsers: parseInt(totalUsers[0].count, 10),
    pendingOrders: parseInt(pendingOrders[0].count, 10),
    revenueToday: parseFloat(revenueToday[0].total ?? "0"),
    ordersToday: parseInt(ordersToday[0].count, 10),
    topProducts,
    recentOrders: recentOrders.map(formatOrderSimple),
    ordersByStatus: ordersByStatus.map(r => ({ status: r.status, count: parseInt(r.count, 10) })),
  });
});

export default router;
