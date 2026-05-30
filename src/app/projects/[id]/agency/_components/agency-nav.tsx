import Link from "next/link";

const TABS = [
  { slug: "", label: "Pipeline", emoji: "🗺️" },
  { slug: "/memory", label: "Mémoire", emoji: "🧠" },
  { slug: "/documents", label: "Documents", emoji: "📎" },
  { slug: "/onboarding", label: "Onboarding", emoji: "📥" },
  { slug: "/compliance", label: "Conformité", emoji: "⚖️" },
  { slug: "/retrospective", label: "Rétrospective", emoji: "♻️" },
  { slug: "/folder", label: "Dossier", emoji: "📁" },
  { slug: "/export", label: "Export", emoji: "📤" },
] as const;

export default function AgencyNav({
  projectId,
  projectName,
  active,
}: {
  projectId: string;
  projectName: string;
  active: (typeof TABS)[number]["slug"];
}) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
        <Link
          href={`/projects/${projectId}`}
          className="hover:text-[var(--color-foreground)]"
        >
          ← {projectName}
        </Link>
        <span>·</span>
        <span className="text-[var(--color-foreground)]">Agency OS</span>
      </div>
      <nav className="mt-4 flex flex-wrap gap-1.5 border-b border-[var(--color-border)] pb-3">
        {TABS.map((t) => {
          const href = `/projects/${projectId}/agency${t.slug}`;
          const isActive = active === t.slug;
          return (
            <Link
              key={t.slug}
              href={href}
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                isActive
                  ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                  : "border border-[var(--color-border)] bg-[var(--color-card)] hover:bg-[var(--color-accent)]"
              }`}
            >
              <span className="mr-1.5">{t.emoji}</span>
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
