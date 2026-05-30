"use client";

import { useState, useTransition } from "react";
import { seedBriefFromAnalysis } from "../actions";

export type ProjectOption = {
  id: string;
  name: string;
};
export type BrandOption = {
  id: string;
  name: string;
};

type Props = {
  importId: string;
  importName: string;
  projects: ProjectOption[];
  brands: BrandOption[];
  hasAnalysis: boolean;
};

export default function SeedBriefModal({
  importId,
  importName,
  projects,
  brands,
  hasAnalysis,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(`Brief — ${importName}`);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [brandId, setBrandId] = useState("");

  if (!hasAnalysis) {
    return (
      <button
        type="button"
        disabled
        title="Lance d'abord l'analyse IA pour pouvoir seeder un brief"
        className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-muted-foreground)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        ✨ Créer un brief depuis ces learnings
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400"
      >
        ✨ Créer un brief depuis ces learnings
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">
              ✨ Créer un brief depuis cette analyse
            </h2>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              Claude va transformer les angles, promesses et concepts gagnants
              en un nouveau brief — en variant les <b>render_styles</b> des
              concepts (façon Andrometa) pour tester si la combinaison
              concept × style fait la différence. ~10-20s de génération.
            </p>

            <form
              action={(fd) =>
                start(async () => {
                  await seedBriefFromAnalysis(importId, fd);
                })
              }
              className="mt-5 flex flex-col gap-4"
            >
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  Projet de destination *
                </label>
                <select
                  name="project_id"
                  required
                  value={projectId}
                  onChange={(ev) => setProjectId(ev.target.value)}
                  disabled={pending}
                  className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-50"
                >
                  {projects.length === 0 ? (
                    <option value="">Aucun projet — crée-en un d&apos;abord</option>
                  ) : (
                    projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))
                  )}
                </select>
                {projects.length === 0 && (
                  // eslint-disable-next-line @next/next/no-html-link-for-pages
                  <a
                    href="/projects"
                    className="mt-1 inline-block text-[10px] text-[var(--color-primary)] hover:underline"
                  >
                    → Créer un projet
                  </a>
                )}
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  Marque (optionnel)
                </label>
                <select
                  name="brand_id"
                  value={brandId}
                  onChange={(ev) => setBrandId(ev.target.value)}
                  disabled={pending}
                  className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-50"
                >
                  <option value="">— Aucune marque —</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">
                  Si tu sélectionnes une marque, sa DA sera injectée
                  automatiquement dans le brief.
                </p>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  Titre du brief
                </label>
                <input
                  name="title"
                  value={title}
                  onChange={(ev) => setTitle(ev.target.value)}
                  disabled={pending}
                  className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-50"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-[var(--color-border)] pt-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  className="rounded-md border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={pending || !projectId}
                  className="rounded-md bg-emerald-500 px-4 py-2 text-xs font-semibold text-black hover:bg-emerald-400 disabled:opacity-50"
                >
                  {pending
                    ? "🤖 Claude génère le brief…"
                    : "✨ Créer le brief"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
