"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  STEP_BY_KEY,
  fillPrompt,
  type StepKey,
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

  // Récupère les valeurs des form fields config + l'override de prompt
  const values: Record<string, string> = {};
  for (const f of step.formFields ?? []) {
    values[f.name] = String(formData.get(f.name) ?? "");
  }
  const promptOverride = String(formData.get("prompt_override") ?? "").trim();
  const finalTask = promptOverride
    ? promptOverride
    : fillPrompt(step.defaultPrompt, values);

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

  const result = await runAgent({
    supabase,
    userId,
    projectId,
    agentKey: step.agentKey,
    stepKey: step.key,
    task: finalTask,
    tools,
    deliverable: {
      kind: step.deliverableKind,
      title: `${step.emoji} ${step.title} · ${new Date().toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`,
    },
    gateOverride: step.gate,
  });

  if (result.status === "failed") {
    redirect(
      `/projects/${projectId}/agency/steps/${stepKey}?error=${encodeURIComponent(
        result.errorMessage ?? "Erreur agent"
      )}`
    );
  }

  revalidatePath(`/projects/${projectId}/agency`);
  revalidatePath(`/projects/${projectId}/agency/steps/${stepKey}`);
  redirect(`/projects/${projectId}/agency/steps/${stepKey}`);
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
