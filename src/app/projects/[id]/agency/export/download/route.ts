/**
 * GET /projects/[id]/agency/export/download
 *
 * Concatène les 7 fichiers client_memory + le profil d'onboarding +
 * renvoie un fichier markdown téléchargeable.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  MEMORY_EXPORT_ORDER,
  MEMORY_TITLES,
  concatMemory,
  type MemorySlug,
} from "@/lib/agents";
import { isAgencyActivated } from "@/lib/agency";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (!project) return new Response("Not found", { status: 404 });

  const profile = await isAgencyActivated(supabase, id);
  if (!profile) {
    return NextResponse.redirect(
      new URL(`/projects/${id}/agency`, _req.url),
      302
    );
  }

  const { data: rows } = await supabase
    .from("client_memory")
    .select("slug, content_md")
    .eq("project_id", id);
  const map: Partial<Record<MemorySlug, string>> = {};
  for (const r of rows ?? []) {
    map[r.slug as MemorySlug] = (r.content_md as string) ?? "";
  }

  const header = `# Mémoire Agency OS — ${project.name}

> Export généré le ${new Date().toLocaleString("fr-FR")}
> Verticale : ${profile.vertical ?? "—"}
> Format : 7 fichiers mémoire concaténés selon MEMORY_EXPORT_ORDER

---
`;

  const body = concatMemory(map);

  const md = `${header}\n${body}\n\n---\n\n## Métadonnées d'export\n\n${MEMORY_EXPORT_ORDER.map(
    (slug) => `- ${slug} (${MEMORY_TITLES[slug]}) — ${(map[slug] ?? "").length} chars`
  ).join("\n")}\n`;

  const slug = project.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "client";
  const filename = `memory-${slug}-${new Date()
    .toISOString()
    .slice(0, 10)}.md`;

  return new NextResponse(md, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
