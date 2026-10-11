import { requireUser } from "@/lib/auth";
import { extractDonation, extractRequirements } from "@/lib/nlp";
import { apiErrorResponse, ApiError, readJson, requireText } from "@/lib/http";

export async function POST(request: Request) {
  try {
    await requireUser(["BUSINESS", "NGO", "ADMIN"]);
    const body = await readJson<Record<string, unknown>>(request);
    const text = requireText(body.text, "Description", 10, 5000);
    const mode = body.mode ?? "donation";
    if (mode !== "donation" && mode !== "requirements") throw new ApiError("Mode must be donation or requirements");
    const extraction = mode === "donation" ? extractDonation(text) : extractRequirements(text);
    return Response.json({ extraction, engine: "rule-assisted-v1", transformerUsed: false, note: "English rules are tested in demo mode. Hindi and Kannada script detection is available, but multilingual entity extraction requires review." });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
