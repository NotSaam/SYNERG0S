"use client";

export function LogoutButton() {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }
  return (
    <button
      type="button"
      onClick={logout}
      className="rounded-md border border-line px-3 py-1.5 font-mono text-xs uppercase tracking-widest text-muted transition-colors hover:border-line-bright hover:text-ink"
    >
      Salir
    </button>
  );
}
