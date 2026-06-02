/**
 * Public API de la couche agents Agency OS.
 *
 * Usage côté server actions :
 *   import { runAgent } from "@/lib/agents";
 *   const result = await runAgent({ supabase, userId, projectId, ... });
 */
export { runAgent } from "./runAgent";
export type { RunAgentArgs, AgentRunResult } from "./runAgent";
export { loadAgent, loadCommonPreamble, clearAgentCache } from "./loader";
export type { AgentDefinition, AgentFrontmatter } from "./loader";
export {
  AGENT_KEYS,
  MODEL_BY_AGENT,
  resolveModel,
  estimateCostUsd,
} from "./model-routing";
export type { AgentKey } from "./model-routing";
export {
  MEMORY_SLUGS,
  MEMORY_TITLES,
  MEMORY_EXPORT_ORDER,
  MEMORY_TEMPLATES,
  concatMemory,
} from "./memory-schema";
export type { MemorySlug } from "./memory-schema";
export {
  addKnowledge,
  listKnowledge,
  deleteKnowledge,
  toggleKnowledgeActive,
  loadKnowledgeForAgent,
  loadAgentMemory,
  formatAgentIdentityExtras,
} from "./knowledge";
export type { KnowledgeKind, AgentKnowledgeRow } from "./knowledge";
export {
  recordFeedback,
  listRecentFeedback,
  countPendingFeedback,
  deleteFeedback,
  markFeedbackIngested,
  loadFeedbackWithRunContext,
} from "./feedback";
export type { AgentFeedbackRow, Rating } from "./feedback";
export { generateRefineProposal, commitRefinement } from "./refine";
export type { RefineProposal } from "./refine";
export { loadSkill, loadSkillsBundle, clearSkillCache } from "./skills";
