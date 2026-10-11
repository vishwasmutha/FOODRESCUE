import "server-only";

import { headers } from "next/headers";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { AuthError } from "@/lib/auth";

export class ApiError extends Error {
  constructor(message: string, public status = 400, public details?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) throw new ApiError("Content-Type must be application/json", 415);
  try {
    return await request.json() as T;
  } catch {
    throw new ApiError("Request body is not valid JSON", 400);
  }
}

export function requireText(value: unknown, label: string, min = 1, max = 5000) {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) throw new ApiError(`${label} must be between ${min} and ${max} characters`);
  return value.trim();
}

export function requireNumber(value: unknown, label: string, min = 0, max = 100_000) {
  const number = typeof value === "string" && value.trim() ? Number(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number) || number < min || number > max) throw new ApiError(`${label} must be a number between ${min} and ${max}`);
  return number;
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof ApiError) return Response.json({ error: error.message, details: error.details ?? null }, { status: error.status });
  if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && /unique|duplicate/i.test(error.message)) return Response.json({ error: "This record already exists" }, { status: 409 });
  console.error(error);
  return Response.json({ error: "An unexpected server error occurred" }, { status: 500 });
}

export function pagination(url: string) {
  const params = new URL(url).searchParams;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = Math.max(1, Math.min(100, Number(params.get("pageSize")) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export async function writeAudit(input: { actorId?: string; action: string; entityType: string; entityId?: string; details?: Record<string, unknown> }) {
  const headerStore = await headers();
  const ipAddress = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  await db.insert(auditLogs).values({ actorId: input.actorId, action: input.action, entityType: input.entityType, entityId: input.entityId, details: input.details ?? {}, ipAddress });
}
