"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/server";
import { runAgent } from "@/lib/agents";

async function loadUserOr401() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

/**
 * Importe un CSV Datablaster (collé ou uploadé) → parsed en jsonb.
 * Pas de schema strict — on parse les colonnes telles quelles, l'agent
 * learning-curator se débrouille avec les noms qu'il voit.
 */
export async function importRetroAction(
  projectId: string,
  formData: FormData
): Promise<void> {
  const { supabase, userId } = await loadUserOr401();

  const source = String(formData.get("source") ?? "datablaster").trim();
  const periodStart = String(formData.get("period_start") ?? "").trim() || null;
  const periodEnd = String(formData.get("period_end") ?? "").trim() || null;
  const raw = String(formData.get("raw_csv") ?? "").trim();
  if (!raw) {
    redirect(
      `/projects/${projectId}/agency/retrospective?error=${encodeURIComponent(
        "CSV vide"
      )}`
    );
  }

  // Parse le CSV — tolérant aux séparateurs ; et ,
  const parsed = Papa.parse<Record<string, string>>(raw, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });
  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    redirect(
      `/projects/${projectId}/agency/retrospective?error=${encodeURIComponent(
        "Parse CSV échoué : " + parsed.errors[0].message
      )}`
    );
  }

  await supabase.from("retro_imports").insert({
    project_id: projectId,
    user_id: userId,
    source,
    raw_csv: raw,
    parsed: { rows: parsed.data, meta: parsed.meta },
    period_start: periodStart,
    period_end: periodEnd,
    status: "parsed",
  });

  revalidatePath(`/projects/${projectId}/agency/retrospective`);
  redirect(
    `/projects/${projectId}/agency/retrospective?ok=${encodeURIComponent(
      `${parsed.data.length} lignes importées`
    )}`
  );
}

/**
 * Lance la rétrospective : agrège les imports en attente sur la période,
 * passe le tout à learning-curator.
 */
export async function runRetroAction(
  projectId: string,
  formData: FormData
): Promise<void> {
  const { supabase, userId } = await loadUserOr401();

  const periodStart = String(formData.get("period_start") ?? "").trim() || null;
  const periodEnd = String(formData.get("period_end") ?? "").trim() || null;
  const metric = String(formData.get("metric") ?? "CPL").trim();

  let q = supabase
    .from("retro_imports")
    .select("id, parsed, period_start, period_end")
    .eq("project_id", projectId)
    .eq("status", "parsed");
  if (periodStart) q = q.gte("period_start", periodStart);
  if (periodEnd) q = q.lte("period_end", periodEnd);
  const { data: imports } = await q;

  if (!imports || imports.length === 0) {
    redirect(
      `/projects/${projectId}/agency/retrospective?error=${encodeURIComponent(
        "Aucun import disponible sur la période"
      )}`
    );
  }

  const allRows = imports.flatMap(
    (i) => ((i.parsed as { rows?: Record<string, string>[] })?.rows ?? [])
  );

  const task = `Rétrospective.

Période : ${periodStart ?? "—"} → ${periodEnd ?? "—"}
Critère retenu : ${metric}
Nombre de lignes Datablaster : ${allRows.length}

## Données brutes (extrait premières 80 lignes max — agrège-les pour identifier patterns)

\`\`\`json
${JSON.stringify(allRows.slice(0, 80), null, 2)}
\`\`\`

Produis :
- Top winners + bottom losers (avec critères filtre).
- Patterns confirmés / infirmés.
- Hypothèses cycle suivant.
- Patches sur memory/creative-learnings.md.
- Patches sur agency_playbooks/winning-hooks-bank (anonymisé).
- Patches sur agent_memory/{creative-strategist, copywriter, market-research}.`;

  const result = await runAgent({
    supabase,
    userId,
    projectId,
    agentKey: "learning-curator",
    stepKey: "retrospective",
    task,
    deliverable: {
      kind: "retro-report",
      title: `♻️ Rétrospective ${periodStart ?? "?"} → ${periodEnd ?? "?"}`,
    },
    gateOverride: false,
  });

  if (result.status === "failed") {
    redirect(
      `/projects/${projectId}/agency/retrospective?error=${encodeURIComponent(
        result.errorMessage ?? "Erreur learning-curator"
      )}`
    );
  }

  // Marque les imports comme analysés
  await supabase
    .from("retro_imports")
    .update({ status: "analysed" })
    .in(
      "id",
      imports.map((i) => i.id as string)
    );

  revalidatePath(`/projects/${projectId}/agency/retrospective`);
  redirect(
    `/projects/${projectId}/agency/retrospective?ok=${encodeURIComponent(
      "Rétrospective produite"
    )}`
  );
}
