import { destroySession, getSessionUser } from "@/lib/auth";
import { apiErrorResponse, writeAudit } from "@/lib/http";

export async function POST() {
  try {
    const user = await getSessionUser();
    await destroySession();
    if (user) await writeAudit({ actorId: user.id, action: "USER_LOGOUT", entityType: "SESSION" });
    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
