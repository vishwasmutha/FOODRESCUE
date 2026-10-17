import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses, ngos, users } from "@/db/schema";
import { createSession, hashPassword } from "@/lib/auth";
import { approximateLocation } from "@/lib/geo";
import { apiErrorResponse, ApiError, readJson, requireText, writeAudit } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(request);
    const name = requireText(body.name, "Name", 2, 160);
    const email = requireText(body.email, "Email", 5, 320).toLowerCase();
    const password = requireText(body.password, "Password", 8, 128);
    const role = body.role;
    if (role !== "BUSINESS" && role !== "NGO") throw new ApiError("Role must be BUSINESS or NGO");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError("Enter a valid email address");
    if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) throw new ApiError("Password must contain an uppercase letter and a number");
    const organizationName = requireText(body.organizationName, "Organization name", 2, 180);
    const address = requireText(body.address, "Address", 5, 1000);
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (taken) throw new ApiError("An account with this email already exists", 409);
    const passwordHash = await hashPassword(password);
    const place = approximateLocation(address);
    const location = place ? { latitude: place.latitude, longitude: place.longitude, city: place.city } : {};
    const created = await db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values({ name, email, passwordHash, role }).returning();
      if (role === "BUSINESS") {
        await tx.insert(businesses).values({ ownerId: user.id, name: organizationName, businessType: typeof body.businessType === "string" ? body.businessType.slice(0, 80) : "Food business", address, ...location });
      } else {
        await tx.insert(ngos).values({ ownerId: user.id, name: organizationName, address, requirementsText: typeof body.requirementsText === "string" ? body.requirementsText.slice(0, 5000) : null, ...location });
      }
      return user;
    });
    await createSession(created.id);
    await writeAudit({ actorId: created.id, action: "USER_REGISTERED", entityType: "USER", entityId: created.id, details: { role } });
    return Response.json({ user: { id: created.id, name: created.name, email: created.email, role: created.role }, message: "Account created. Organization verification is pending." }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
