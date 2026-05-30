import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { login, signup } from "./actions";
import { safeDecode } from "@/lib/safe-decode";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/projects");

  const isSignup = params.mode === "signup";

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-8">
        <Link
          href="/"
          className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          ← Crea Process
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">
          {isSignup ? "Créer un compte" : "Connexion"}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          {isSignup
            ? "Crée ton compte pour démarrer."
            : "Connecte-toi pour accéder à tes projets."}
        </p>

        {params.error && (
          <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {safeDecode(params.error)}
          </div>
        )}

        <form className="mt-6 flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-[var(--color-muted-foreground)]">
              Email
            </label>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--color-muted-foreground)]">
              Mot de passe
            </label>
            <input
              type="password"
              name="password"
              required
              minLength={8}
              autoComplete={isSignup ? "new-password" : "current-password"}
              className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>

          <button
            formAction={isSignup ? signup : login}
            className="mt-2 w-full rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
          >
            {isSignup ? "Créer mon compte" : "Se connecter"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-[var(--color-muted-foreground)]">
          {isSignup ? (
            <Link href="/login" className="hover:text-[var(--color-foreground)]">
              Déjà un compte ? Se connecter
            </Link>
          ) : (
            <Link
              href="/login?mode=signup"
              className="hover:text-[var(--color-foreground)]"
            >
              Pas de compte ? Créer un compte
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
