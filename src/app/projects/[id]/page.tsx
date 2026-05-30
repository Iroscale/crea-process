import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, description, brand_voice, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!project) notFound();

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <Link
        href="/projects"
        className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        ← Retour aux projets
      </Link>

      <h1 className="mt-3 text-3xl font-semibold">{project.name}</h1>
      {project.description && (
        <p className="mt-2 text-[var(--color-muted-foreground)]">
          {project.description}
        </p>
      )}

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          step={1}
          title="Knowledge base"
          desc="Docs produit, scripts, ads existantes."
          href={`/projects/${project.id}/knowledge`}
          cta="Gérer"
          enabled
        />
        <Card
          step={2}
          title="Briefs"
          desc="Inspiration concurrente ou chat avec l'IA."
          href={`/projects/${project.id}/briefs`}
          cta="Gérer"
          enabled
        />
        <Card
          step={3}
          title="Génération"
          desc="Variations multi-modèles via fal.ai."
          href={`/projects/${project.id}/briefs`}
          cta="Briefs"
          enabled
        />
        <Card
          step={4}
          title="Landing pages"
          desc="Brief LP + 2 versions A/B + chat refine."
          href={`/projects/${project.id}/landing-pages`}
          cta="Créer"
          enabled
        />
        <Card
          step={5}
          title="Recherche de concepts"
          desc="Web search : angles, pain points, questions Reddit, tendances."
          href={`/projects/${project.id}/concept-research`}
          cta="Explorer"
          enabled
        />
      </div>
    </main>
  );
}

function Card({
  step,
  title,
  desc,
  href,
  cta,
  enabled = false,
}: {
  step: number;
  title: string;
  desc: string;
  href: string;
  cta: string;
  enabled?: boolean;
}) {
  const className =
    "block rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 transition";
  const content = (
    <>
      <div className="text-xs font-semibold text-[var(--color-primary)]">
        Étape {step}
      </div>
      <div className="mt-2 text-base font-semibold">{title}</div>
      <div className="mt-1 text-sm text-[var(--color-muted-foreground)]">
        {desc}
      </div>
      <div className="mt-4 text-xs text-[var(--color-muted-foreground)]">
        {cta} →
      </div>
    </>
  );
  return enabled ? (
    <Link href={href} className={`${className} hover:border-[var(--color-primary)]`}>
      {content}
    </Link>
  ) : (
    <div className={`${className} cursor-not-allowed opacity-60`}>{content}</div>
  );
}
