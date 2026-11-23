import { LoginForm } from "@/components/login-form";
import { Logo } from "@/components/ui";

export const metadata = { title: "Entrar — SYNERG0S" };

export default function LoginPage() {
  return (
    <main className="grid flex-1 place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="hud p-6">
          <h1 className="font-display text-xl font-semibold">Acceso a la demo</h1>
          <p className="mb-6 mt-1 text-sm text-muted">
            Entra con el usuario de prueba para lanzar peticiones al equipo de agentes.
          </p>
          <LoginForm />
        </div>
        <p className="label mt-6 text-center">Orquestador · Develop · Testing</p>
      </div>
    </main>
  );
}
