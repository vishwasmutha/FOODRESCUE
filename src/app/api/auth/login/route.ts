import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, verifyPassword } from "@/lib/auth";
import { apiErrorResponse, ApiError, readJson, requireText, writeAudit } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(request);
    const email = requireText(body.email, "Email", 5, 320).toLowerCase();
    const password = requireText(body.password, "Password", 1, 128);
    const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
    if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) throw new ApiError("Invalid email or password", 401);
    const expiresAt = await createSession(user.id);
    await writeAudit({ actorId: user.id, action: "USER_LOGIN", entityType: "SESSION", details: { expiresAt: expiresAt.toISOString() } });
    return Response.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, expiresAt });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
