import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

/**
 * Comprobación optimista de sesión antes de renderizar: sin cookie válida → /login.
 * La autorización real (¿esta ejecución es tuya?) se hace en cada ruta de la API.
 */
export async function proxy(request: NextRequest) {
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const isLogin = request.nextUrl.pathname === "/login";

  if (!session && !isLogin) return NextResponse.redirect(new URL("/login", request.url));
  if (session && isLogin) return NextResponse.redirect(new URL("/", request.url));
  return NextResponse.next();
}

export const config = {
  // Páginas de la app. La API responde 401 por su cuenta y /preview es pública por UUID.
  matcher: ["/", "/login", "/runs/:path*"],
};
