import { eq } from "drizzle-orm";
import { db } from "@/db";
import { foodCategories } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/http";

export async function GET() {
  try {
    await requireUser();
    const data = await db.select().from(foodCategories).where(eq(foodCategories.isActive, true));
    return Response.json({ data });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
