/**
 * P1.1 — Export pack client.
 *
 * GET /projects/[id]/agency/export/pack
 * Assemble tous les livrables `validated` (ou `delivered`) dans l'ordre du
 * pipeline, avec page de garde (nom client, date, sommaire), et renvoie un
 * fichier markdown téléchargeable. Les livrables exportés passent en
 * `delivered`.
 *
 * Format .md immédiat ; .docx/PDF pourront être ajoutés plus tard (aucune
 * lib d'écriture docx dans les deps actuelles).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { STEPS, isAgencyActivated } from "@/lib/agency";

export async function GET(
  req: Request,
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
    return NextResponse.redirect(new URL(`/projects/${id}/agency`, req.url), 302);
  }

  // Livrables validés ou déjà livrés
  const { data: deliverables } = await supabase
    .from("deliverables")
    .select("id, step_key, kind, title, content_md, status, version, created_at")
    .eq("project_id", id)
    .in("status", ["validated", "delivered"])
    .order("created_at", { ascending: true });

  const list = deliverables ?? [];
  if (list.length === 0) {
    return NextResponse.redirect(
      new URL(
        `/projects/${id}/agency/export?error=${encodeURIComponent(
          "Aucun livrable validé à exporter — valide d'abord les gates des étapes."
        )}`,
        req.url
      ),
      302
    );
  }

  // Ordonne par position de l'étape dans le pipeline
  const orderByStep = new Map(STEPS.map((s) => [s.key as string, s.order]));
  const titleByStep = new Map(
    STEPS.map((s) => [s.key as string, `${s.emoji} ${s.title}`])
  );
  list.sort(
    (a, b) =>
      (orderByStep.get(a.step_key as string) ?? 99) -
      (orderByStep.get(b.step_key as string) ?? 99)
  );

  // Page de garde + sommaire
  const now = new Date();
  const parts: string[] = [
    `# Pack livrables — ${project.name}`,
    "",
    `> Généré le ${now.toLocaleString("fr-FR")} · ${list.length} livrable(s) validé(s)`,
    `> Verticale : ${profile.vertical ?? "—"}`,
    "",
    "## Sommaire",
    "",
  ];
  for (const d of list) {
    parts.push(
      `- ${titleByStep.get(d.step_key as string) ?? d.step_key} — ${d.title} (v${d.version})`
    );
  }
  parts.push("");
  parts.push("---");

  // Corps : un chapitre par livrable
  for (const d of list) {
    parts.push("");
    parts.push(`# ${titleByStep.get(d.step_key as string) ?? d.step_key}`);
    parts.push("");
    parts.push(
      `_${d.title} · v${d.version} · validé · ${new Date(d.created_at as string).toLocaleDateString("fr-FR")}_`
    );
    parts.push("");
    parts.push((d.content_md as string).trim());
    parts.push("");
    parts.push("---");
  }

  const md = parts.join("\n");

  // Marque les livrables comme delivered
  await supabase
    .from("deliverables")
    .update({ status: "delivered" })
    .in(
      "id",
      list.map((d) => d.id as string)
    );

  const slug =
    project.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "client";
  const filename = `pack-${slug}-${now.toISOString().slice(0, 10)}.md`;

  return new NextResponse(md, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
