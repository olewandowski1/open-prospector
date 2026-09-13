import type { SearchBriefDefaults } from "@/features/prospecting-runs/application/prospecting-run"
import type {
  RuntimeId,
  RuntimeModelCatalog,
  RuntimeReadiness,
  RuntimeReasoningEffort,
} from "@/features/runtime-settings/client"
import { defaultRuntimeExecutionConfiguration } from "@/features/runtime-settings/client"

export const categoryPresets = [
  "Dental clinics",
  "Restaurants",
  "Beauty salons",
  "Construction companies",
  "Law firms",
  "Custom category",
] as const

export type SearchBriefDraftState = Readonly<{
  location: string
  radiusKm: string
  categoryChoice: string
  customCategory: string
  targetCount: string
  mode: "Quick" | "Thorough"
  runtime: RuntimeId | ""
  model: string
  reasoningEffort: RuntimeReasoningEffort
  recentBusinessPolicy: "Skip" | "IncludeWithoutReassessment" | "Reassess"
}>

export function initialSearchBriefDraft(
  defaults: SearchBriefDefaults | undefined,
  readyRuntimes: readonly RuntimeReadiness[],
  selectedRuntime: RuntimeId | undefined,
  modelCatalog?: RuntimeModelCatalog,
): SearchBriefDraftState {
  const defaultCategory = defaults?.category ?? "Dental clinics"
  const categoryIsPreset = categoryPresets.some(
    (category) => category !== "Custom category" && category === defaultCategory,
  )
  const preferredRuntime = readyRuntimes.some((runtime) => runtime.runtimeId === selectedRuntime)
    ? selectedRuntime
    : readyRuntimes[0]?.runtimeId
  const configuration = preferredRuntime
    ? defaultRuntimeExecutionConfiguration(preferredRuntime, modelCatalog?.[preferredRuntime])
    : { model: "", reasoningEffort: "medium" as const }
  return {
    location: "",
    radiusKm: defaults?.radiusKm?.toString() ?? "",
    categoryChoice: categoryIsPreset ? defaultCategory : "Custom category",
    customCategory: categoryIsPreset ? "" : defaultCategory,
    targetCount: String(defaults?.targetCount ?? 10),
    mode: defaults?.mode ?? "Quick",
    runtime: preferredRuntime ?? "",
    model: configuration.model,
    reasoningEffort: configuration.reasoningEffort,
    recentBusinessPolicy: "Skip",
  }
}

export function serializeSearchBriefDraft(draft: SearchBriefDraftState) {
  return {
    location: draft.location,
    ...(draft.radiusKm === "" ? {} : { radiusKm: Number(draft.radiusKm) }),
    category:
      draft.categoryChoice === "Custom category" ? draft.customCategory : draft.categoryChoice,
    targetCount: Number(draft.targetCount),
    mode: draft.mode,
    runtime: draft.runtime,
    runtimeConfiguration: { model: draft.model, reasoningEffort: draft.reasoningEffort },
    recentBusinessPolicy: draft.recentBusinessPolicy,
  }
}
