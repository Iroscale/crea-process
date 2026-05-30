/**
 * Public API de la couche Agency OS spécifique au projet.
 */
export {
  STEPS,
  STEP_BY_KEY,
  PIPELINE_STEPS,
  ONBOARDING_STEP,
  EXTRA_STEPS,
  fillPrompt,
  getNextStep,
  getPreviousStep,
  getActionableStep,
} from "./pipeline";
export type { StepKey, StepConfig } from "./pipeline";
export {
  activateAgencyOS,
  isAgencyActivated,
} from "./activation";
export type { AgencyProfileRow } from "./activation";
export {
  uploadDocument,
  listDocuments,
  deleteDocument,
  updateDocumentMeta,
  createSignedUrl,
  buildDocumentsContextMd,
} from "./documents";
export type { ClientDocumentRow } from "./documents";
