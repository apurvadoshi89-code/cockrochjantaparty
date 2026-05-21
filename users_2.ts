import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { UpdateProfileBody } from "@workspace/api-zod";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

function formatUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone ?? null,
    isAdmin: user.isAdmin,
    createdAt: user.createdAt.toISOString(),
  };
}

router.get("/users", requireAuth, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const users = await db.select().from(usersTable);
  res.json(users.map(formatUser));
});

router.patch("/users/profile", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = (req as Request & { user?: typeof usersTable.$inferSelect }).user!;
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [updated] = await db.update(usersTable).set(parsed.data).where(eq(usersTable.id, user.id)).returning();
  res.json(formatUser(updated));
});

export default router;
