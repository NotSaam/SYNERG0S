import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { createSession } from "@/lib/auth";

// Hash de relleno: si el usuario no existe se compara igualmente, para no delatarlo por tiempo.
const DUMMY_HASH = "$2b$10$drupQMJ34xdbLN13rgsYDu..TjdmvUBshP2FwLDq7TBQskX/sFuVS";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { username?: unknown; password?: unknown } | null;
  const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!username || !password || username.length > 64 || password.length > 200) {
    return Response.json({ error: "Usuario o contraseña incorrectos." }, { status: 401 });
  }

  const [user] = await getDb().select().from(users).where(eq(users.username, username));
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    return Response.json({ error: "Usuario o contraseña incorrectos." }, { status: 401 });
  }

  await createSession({ userId: user.id, username: user.username });
  return Response.json({ ok: true });
}
