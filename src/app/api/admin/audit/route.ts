import { desc } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { apiErrorResponse, pagination } from "@/lib/http";

export async function GET(request: Request) {
  try {
    await requireUser(["ADMIN"]);
    const { page, pageSize, offset } = pagination(request.url);
    const data = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(pageSize).offset(offset);
    return Response.json({ data, pagination: { page, pageSize } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
