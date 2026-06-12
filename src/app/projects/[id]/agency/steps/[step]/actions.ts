"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  STEP_BY_KEY,
  fillPrompt,
  buildStructuredInstruction,
  processStructuredOutput,
  regenerateSingleItem,
  generateMoreItems,
  setItemStatus,
  rerenderDeliverableFromItems,
  type StepKey,
  type ItemStatus,
  type ItemKind,
} from "@/lib/agency";
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
 * Lance l'étape : agrège les champs du formulaire, construit le prompt,
 * appelle l'agent. Pour market-research, on injecte le web_search server tool.
 */
export async function launchStepAction(
  projectId: string,
  stepKey: StepKey,
  formData: FormData
): Promise<void> {
  const step = STEP_BY_KEY[stepKey];
  if (!step || !step.agentKey) {
    redirect(
      `/projects/${projectId}/agency?error=${encodeURIComponent(
        `Étape sans agent : ${stepKey}`
      )}`
    );
  }

  const { supabase, userId } = await loadUserOr401();

  // Récupère les valeurs des form fields config + l'override de prompt.
  // P0.3 : les fields items-select fournissent des item_keys d'items
  // VALIDÉS — on injecte leur contenu complet dans le contexte.
  const values: Record<string, string> = {};
  let selectedItemsContext = "";
  for (const f of step.formFields ?? []) {
    if (f.type === "items-select") {
      const selectedIds = formData
        .getAll(f.name)
        .map((v) => String(v))
        .filter(Boolean);
      if (selectedIds.length === 0) {
        if (f.required) {
          redirect(
            `/projects/${projectId}/agency/steps/${stepKey}?error=${encodeURIComponent(
              `Sélectionne au moins un item pour « ${f.label} »`
            )}`
          );
        }
        values[f.name] = "—";
        continue;
      }
      const { data: items } = await supabase
        .from("deliverable_items")
        .select("item_key, title, content_md, status")
        .eq("project_id", projectId)
        .in("id", selectedIds);
      const validatedItems = (items ?? []).filter(
        (i) => i.status === "validated"
      );
      values[f.name] = validatedItems.map((i) => i.item_key).join(", ");
      selectedItemsContext += `\n\n# ${f.label} (items validés — référence-les via leur item_key)\n`;
      for (const it of validatedItems) {
        selectedItemsContext += `\n## item_key: ${it.item_key}\n${it.content_md}\n`;
      }
    } else {
      const v = String(formData.get(f.name) ?? "").trim();
      // P1.3 : un champ requis vide ne part plus en « — » silencieux —
      // erreur UI avant l'appel.
      if (f.required && !v) {
        redirect(
          `/projects/${projectId}/agency/steps/${stepKey}?error=${encodeURIComponent(
            `Le champ « ${f.label} » est requis`
          )}`
        );
      }
      values[f.name] = v;
    }
  }
  const promptOverride = String(formData.get("prompt_override") ?? "").trim();
  let finalTask = promptOverride
    ? promptOverride
    : fillPrompt(step.defaultPrompt, values);
  if (selectedItemsContext) finalTask += selectedItemsContext;
  // P0.3 : sortie JSON structurée pour les étapes décomposées en items
  if (step.structuredKind) {
    finalTask += buildStructuredInstruction(step.structuredKind);
  }

  // Outils par étape — pour l'instant seul market-research utilise web_search
  const tools =
    step.agentKey === "market-research"
      ? [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 8,
          },
        ]
      : undefined;

  // ─── P0.6 : exécution asynchrone ────────────────────────────────────────
  // Anti double-submit : si un run est déjà en cours sur ce step, on refuse.
  const { data: alreadyRunning } = await supabase
    .from("agent_runs")
    .select("id")
    .eq("project_id", projectId)
    .eq("step_key", step.key)
    .eq("status", "running")
    .limit(1)
    .maybeSingle();
  if (alreadyRunning) {
    redirect(
      `/projects/${projectId}/agency/steps/${stepKey}?error=${encodeURIComponent(
        "Un agent travaille déjà sur cette étape — attends la fin du run en cours."
      )}`
    );
  }

  // Crée la ligne agent_runs AVANT le redirect pour permettre le polling.
  const { data: runRow, error: runErr } = await supabase
    .from("agent_runs")
    .insert({
      project_id: projectId,
      user_id: userId,
      step_key: step.key,
      agent_key: step.agentKey,
      model: "(résolution en cours)",
      status: "running",
      input_snapshot: { task: finalTask },
    })
    .select("id")
    .single();
  if (runErr || !runRow) {
    redirect(
      `/projects/${projectId}/agency/steps/${stepKey}?error=${encodeURIComponent(
        runErr?.message ?? "Création du run impossible"
      )}`
    );
  }
  const runId = runRow.id as string;

  // Le step passe in_progress immédiatement (visible sur le kanban)
  await supabase.from("pipeline_steps").upsert(
    {
      project_id: projectId,
      user_id: userId,
      step_key: step.key,
      status: "in_progress",
      current_run_id: runId,
      has_gate: step.gate,
    },
    { onConflict: "project_id,step_key" }
  );

  // Le travail lourd (appel LLM 1-5 min) s'exécute APRÈS la réponse HTTP
  // via after() (Next 15.1 stable, supporté par Vercel via waitUntil).
  // La page poll agent_runs.status toutes les 3 s.
  const agentKey = step.agentKey;
  const structuredKind = step.structuredKind;
  const deliverableTitle = `${step.emoji} ${step.title} · ${new Date().toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`;
  after(async () => {
    try {
      const result = await runAgent({
        supabase,
        userId,
        projectId,
        agentKey,
        stepKey: step.key,
        task: finalTask,
        tools,
        maxTokens: step.maxTokens ?? (structuredKind ? 12000 : 8000),
        deliverable: {
          kind: step.deliverableKind,
          title: deliverableTitle,
        },
        gateOverride: step.gate,
        existingRunId: runId,
      });

      // P0.3 : post-traitement structuré (parse JSON + retry + items)
      if (
        structuredKind &&
        result.status === "done" &&
        result.deliverableId
      ) {
        const structured = await processStructuredOutput(supabase, {
          userId,
          projectId,
          deliverableId: result.deliverableId,
          kind: structuredKind,
          rawText: result.text,
          model: result.model,
        });
        if ("error" in structured) {
          // On ne fait pas échouer le run : le livrable brut reste
          // consultable. On trace l'erreur dans le run.
          await supabase
            .from("agent_runs")
            .update({
              error_message: `Structuration échouée : ${structured.error}`,
            })
            .eq("id", runId);
        }
      }
    } catch (e) {
      await supabase
        .from("agent_runs")
        .update({
          status: "failed",
          error_message: (e as Error).message,
          finished_at: new Date().toISOString(),
        })
        .eq("id", runId);
      await supabase
        .from("pipeline_steps")
        .update({ status: "failed" })
        .eq("project_id", projectId)
        .eq("step_key", step.key);
    }
  });

  revalidatePath(`/projects/${projectId}/agency`);
  revalidatePath(`/projects/${projectId}/agency/steps/${stepKey}`);
  redirect(`/projects/${projectId}/agency/steps/${stepKey}?launched=1`);
}

/**
 * Pour l'étape 04 : pass production-assistant sur le dernier script founder
 * pour produire un script prompteur humanisé + plan de tournage.
 */
export async function productionPassAction(
  projectId: string,
  formData: FormData
): Promise<void> {
  const { supabase, userId } = await loadUserOr401();

  // Récupère le dernier deliverable founder-script du projet
  const { data: latest } = await supabase
    .from("deliverables")
    .select("id, content_md, title")
    .eq("project_id", projectId)
    .eq("kind", "founder-script")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest) {
    redirect(
      `/projects/${projectId}/agency/steps/04-video-founder-ads?error=${encodeURIComponent(
        "Aucun script founder à humaniser. Lance d'abord l'étape 04."
      )}`
    );
  }

  const note = String(formData.get("note") ?? "").trim();

  const task = `Script founder à humaniser et préparer pour le tournage.

# Script source (output de l'étape 04)
${latest.content_md}

# Mission
1. Humanise le copy (anti-IA-ish complet).
2. Produis le script prompteur formaté.
3. Produis le plan de tournage du jour J (shot list, ordre, valeurs de plan,
   lumière, son, prompteur, comportement fondateur, pièges à éviter).
4. Brief Loom client : ce qu'on filme, date proposée, orga vidéaste.

${note ? `# Note particulière\n${note}` : ""}`;

  const result = await runAgent({
    supabase,
    userId,
    projectId,
    agentKey: "production-assistant",
    stepKey: "04-video-founder-ads", // même step que le script source
    task,
    deliverable: {
      kind: "founder-shoot-pack",
      title: `🎬 Pack tournage (humanisé) · ${new Date().toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`,
    },
    gateOverride: true, // garde le gate Loom client + date prod sur l'étape
  });

  if (result.status === "failed") {
    redirect(
      `/projects/${projectId}/agency/steps/04-video-founder-ads?error=${encodeURIComponent(
        result.errorMessage ?? "Erreur production-assistant"
      )}`
    );
  }

  revalidatePath(`/projects/${projectId}/agency/steps/04-video-founder-ads`);
  redirect(`/projects/${projectId}/agency/steps/04-video-founder-ads`);
}

// ─────────────────────────────────────────────────────────────────────────
// P0.3 — Actions par item structuré
// ─────────────────────────────────────────────────────────────────────────

/** Change le statut d'un item (valider / rejeter / re-proposer). */
export async function itemStatusAction(
  projectId: string,
  stepKey: StepKey,
  itemId: string,
  deliverableId: string,
  kind: ItemKind,
  status: ItemStatus
): Promise<void> {
  const { supabase, userId } = await loadUserOr401();
  await setItemStatus(supabase, { userId, itemId, status });
  // Le rendu du livrable reflète les items non-rejetés
  await rerenderDeliverableFromItems(supabase, { deliverableId, kind });
  revalidatePath(`/projects/${projectId}/agency/steps/${stepKey}`);
  redirect(`/projects/${projectId}/agency/steps/${stepKey}#items`);
}

/** Régénère UN item via l'agent (avec consigne optionnelle). */
export async function regenerateItemAction(
  projectId: string,
  stepKey: StepKey,
  itemId: string,
  formData: FormData
): Promise<void> {
  const { supabase, userId } = await loadUserOr401();
  const instruction =
    String(formData.get("instruction") ?? "").trim() || undefined;
  const res = await regenerateSingleItem(supabase, {
    userId,
    projectId,
    itemId,
    instruction,
  });
  if ("error" in res) {
    redirect(
      `/projects/${projectId}/agency/steps/${stepKey}?error=${encodeURIComponent(res.error)}`
    );
  }
  revalidatePath(`/projects/${projectId}/agency/steps/${stepKey}`);
  redirect(`/projects/${projectId}/agency/steps/${stepKey}#items`);
}

/** « Propose-m'en N de plus » via l'agent. */
export async function addMoreItemsAction(
  projectId: string,
  stepKey: StepKey,
  deliverableId: string,
  formData: FormData
): Promise<void> {
  const { supabase, userId } = await loadUserOr401();
  const count = Math.min(
    Math.max(parseInt(String(formData.get("count") ?? "3"), 10) || 3, 1),
    6
  );
  const instruction =
    String(formData.get("instruction") ?? "").trim() || undefined;
  const res = await generateMoreItems(supabase, {
    userId,
    projectId,
    deliverableId,
    count,
    instruction,
  });
  if ("error" in res) {
    redirect(
      `/projects/${projectId}/agency/steps/${stepKey}?error=${encodeURIComponent(res.error)}`
    );
  }
  revalidatePath(`/projects/${projectId}/agency/steps/${stepKey}`);
  redirect(`/projects/${projectId}/agency/steps/${stepKey}#items`);
}
