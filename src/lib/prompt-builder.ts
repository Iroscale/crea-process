/**
 * Compiles a project's knowledge base into a single system prompt
 * for the copywriting agent.
 */
import { createClient } from "@/lib/supabase/server";
import type { StructuredKnowledge } from "./structured-knowledge-schema";

const KIND_HEADINGS: Record<string, string> = {
  product_doc: "Documentation produit",
  copywriting_doc: "Frameworks copywriting",
  past_ad: "Ads existantes",
  script: "Scripts vidéo / VSL",
  other: "Autres références",
};

const SECTION_ORDER = [
  "product_doc",
  "copywriting_doc",
  "script",
  "past_ad",
  "other",
] as const;

export type CompiledPrompt = {
  systemPrompt: string;
  charCount: number;
  fileCount: number;
};

export async function buildSystemPrompt(
  projectId: string
): Promise<CompiledPrompt> {
  const supabase = await createClient();

  // Base query that always works. We don't include structured_knowledge here
  // so the prompt still builds even if migration 010 hasn't been applied.
  const { data: project } = await supabase
    .from("projects")
    .select("name, description, brand_voice")
    .eq("id", projectId)
    .single();

  // Try to load the optional structured brief separately. Fail silently if
  // the column doesn't exist yet.
  let structured: StructuredKnowledge | null = null;
  {
    const { data, error } = await supabase
      .from("projects")
      .select("structured_knowledge")
      .eq("id", projectId)
      .maybeSingle();
    if (!error) {
      structured =
        ((data?.structured_knowledge ?? null) as StructuredKnowledge | null) ??
        null;
    }
  }

  const { data: files } = await supabase
    .from("knowledge_files")
    .select("file_name, kind, extracted_text")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  const sections: string[] = [];

  sections.push(
    "Tu es un copywriter expert spécialisé dans la création d'ads carrées (1:1) pour réseaux sociaux. " +
      "Tu écris des hooks puissants, du copy direct et orienté conversion. " +
      "Tu maîtrises les frameworks AIDA, PAS, BAB, et les principes du direct response."
  );

  if (project?.name || project?.description) {
    sections.push(`# Projet : ${project?.name ?? ""}`);
    if (project?.description) sections.push(project.description);
  }

  if (project?.brand_voice) {
    sections.push("# Tone of voice");
    sections.push(project.brand_voice);
  }

  // Structured product brief (when present, this is the most condensed and
  // refined view of the knowledge base — it sits ABOVE the raw documents in
  // the prompt so the agent reaches for the synthesis first, and uses the raw
  // docs only as deep-context backup).
  if (structured) {
    sections.push("# Brief produit structuré");
    sections.push(formatStructuredKnowledge(structured));
  }

  // Group files by kind
  const byKind = new Map<string, { file_name: string; extracted_text: string }[]>();
  for (const f of files ?? []) {
    if (!f.extracted_text) continue;
    const arr = byKind.get(f.kind) ?? [];
    arr.push({ file_name: f.file_name, extracted_text: f.extracted_text });
    byKind.set(f.kind, arr);
  }

  for (const kind of SECTION_ORDER) {
    const items = byKind.get(kind);
    if (!items || items.length === 0) continue;
    sections.push(`# ${KIND_HEADINGS[kind] ?? kind}`);
    for (const item of items) {
      sections.push(`## ${item.file_name}\n\n${item.extracted_text}`);
    }
  }

  const systemPrompt = sections.join("\n\n");

  return {
    systemPrompt,
    charCount: systemPrompt.length,
    fileCount: files?.filter((f) => f.extracted_text).length ?? 0,
  };
}

function formatStructuredKnowledge(s: StructuredKnowledge): string {
  const lines: string[] = [];
  lines.push(`**Produit** : ${s.product_summary}`);
  lines.push(`**Cible** : ${s.target_audience}`);
  if (s.pain_points.length > 0)
    lines.push(`**Pain points** :\n${bullets(s.pain_points)}`);
  if (s.value_propositions.length > 0)
    lines.push(`**Value propositions** :\n${bullets(s.value_propositions)}`);
  if (s.differentiators.length > 0)
    lines.push(`**Différenciateurs** :\n${bullets(s.differentiators)}`);
  if (s.proof_points.length > 0)
    lines.push(`**Proof points** :\n${bullets(s.proof_points)}`);
  if (s.pricing) lines.push(`**Pricing** : ${s.pricing}`);
  if (s.objections.length > 0)
    lines.push(`**Objections** :\n${bullets(s.objections)}`);
  lines.push(`**Brand voice — ton** : ${s.brand_voice.tone}`);
  if (s.brand_voice.do_say.length > 0)
    lines.push(`**À dire** : ${s.brand_voice.do_say.join(" · ")}`);
  if (s.brand_voice.dont_say.length > 0)
    lines.push(`**À éviter** : ${s.brand_voice.dont_say.join(" · ")}`);
  if (s.hooks_to_use.length > 0)
    lines.push(`**Hooks à utiliser** :\n${bullets(s.hooks_to_use)}`);
  if (s.hooks_to_avoid.length > 0)
    lines.push(`**Hooks à éviter** :\n${bullets(s.hooks_to_avoid)}`);
  if (s.legal_constraints)
    lines.push(`**Contraintes légales** : ${s.legal_constraints}`);
  if (s.notes) lines.push(`**Notes / corrections utilisateur** : ${s.notes}`);
  return lines.join("\n\n");
}

function bullets(items: string[]): string {
  return items.map((i) => `- ${i}`).join("\n");
}
