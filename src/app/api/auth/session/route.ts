import { getSessionUser } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/http";

export async function GET() {
  try {
    const user = await getSessionUser();
    return Response.json({ user });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
