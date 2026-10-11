import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses, ngos, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { apiErrorResponse, ApiError, readJson, requireText, writeAudit } from "@/lib/http";

export async function GET() {
  try {
    await requireUser(["ADMIN"]);
    const businessRows = await db.select({ id: businesses.id, name: businesses.name, type: businesses.businessType, city: businesses.city, status: businesses.verificationStatus, ownerName: users.name, email: users.email, createdAt: businesses.createdAt }).from(businesses).innerJoin(users, eq(users.id, businesses.ownerId)).orderBy(desc(businesses.createdAt));
    const ngoRows = await db.select({ id: ngos.id, name: ngos.name, type: ngos.registrationNumber, city: ngos.city, status: ngos.verificationStatus, ownerName: users.name, email: users.email, createdAt: ngos.createdAt }).from(ngos).innerJoin(users, eq(users.id, ngos.ownerId)).orderBy(desc(ngos.createdAt));
    return Response.json({ data: [...businessRows.map((item) => ({ ...item, role: "BUSINESS" })), ...ngoRows.map((item) => ({ ...item, role: "NGO" }))] });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser(["ADMIN"]);
    const body = await readJson<Record<string, unknown>>(request);
    const id = requireText(body.id, "Organization", 36, 36);
    const role = body.role;
    const status = body.status;
    if (role !== "BUSINESS" && role !== "NGO") throw new ApiError("Invalid organization role");
    if (status !== "PENDING" && status !== "VERIFIED" && status !== "SUSPENDED") throw new ApiError("Invalid verification status");
    const rows = role === "BUSINESS" ? await db.update(businesses).set({ verificationStatus: status, updatedAt: new Date() }).where(eq(businesses.id, id)).returning() : await db.update(ngos).set({ verificationStatus: status, updatedAt: new Date() }).where(eq(ngos.id, id)).returning();
    if (!rows.length) throw new ApiError("Organization not found", 404);
    await writeAudit({ actorId: user.id, action: `ORGANIZATION_${status}`, entityType: role, entityId: id });
    return Response.json({ organization: rows[0] });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
