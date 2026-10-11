import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { apiErrorResponse, ApiError, readJson } from "@/lib/http";

export async function GET() {
  try {
    const user = await requireUser();
    const data = await db.select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)).limit(50);
    return Response.json({ data, unread: data.filter((item) => item.status !== "READ").length, transport: "in-app-polling", pollAfterSeconds: 15 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    if (body.all === true) {
      await db.update(notifications).set({ status: "READ", readAt: new Date() }).where(and(eq(notifications.userId, user.id), ne(notifications.status, "READ")));
    } else if (typeof body.id === "string") {
      const [updated] = await db.update(notifications).set({ status: "READ", readAt: new Date() }).where(and(eq(notifications.id, body.id), eq(notifications.userId, user.id))).returning();
      if (!updated) throw new ApiError("Notification not found", 404);
    } else throw new ApiError("Provide a notification id or all=true");
    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
