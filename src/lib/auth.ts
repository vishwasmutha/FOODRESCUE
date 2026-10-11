import "server-only";

import { createHash, pbkdf2 as pbkdf2Callback, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";

const pbkdf2 = promisify(pbkdf2Callback);
const SESSION_COOKIE = "foodrescue_session";
const SESSION_DAYS = 7;
const HASH_ITERATIONS = 210_000;

export type AppRole = "BUSINESS" | "NGO" | "ADMIN";
export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  timezone: string;
  locale: string;
};

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await pbkdf2(password, salt, HASH_ITERATIONS, 32, "sha256");
  return `pbkdf2_sha256$${HASH_ITERATIONS}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, iterationText, saltHex, hashHex] = encoded.split("$");
  if (algorithm !== "pbkdf2_sha256" || !iterationText || !saltHex || !hashHex) return false;
  const iterations = Number(iterationText);
  if (!Number.isSafeInteger(iterations) || iterations < 100_000) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await pbkdf2(password, Buffer.from(saltHex, "hex"), iterations, expected.length, "sha256");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function tokenDigest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ tokenHash: tokenDigest(token), userId, expiresAt });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return expiresAt;
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, tokenDigest(token)));
  store.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [result] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      timezone: users.timezone,
      locale: users.locale,
      isActive: users.isActive,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenDigest(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!result?.isActive) return null;
  return {
    id: result.id,
    email: result.email,
    name: result.name,
    role: result.role,
    timezone: result.timezone,
    locale: result.locale,
  };
}

export async function requireUser(roles?: AppRole[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Authentication required", 401);
  if (roles && !roles.includes(user.role)) throw new AuthError("You do not have permission for this action", 403);
  return user;
}

export class AuthError extends Error {
  constructor(message: string, public status: 401 | 403) {
    super(message);
    this.name = "AuthError";
  }
}

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status });
  return null;
}
