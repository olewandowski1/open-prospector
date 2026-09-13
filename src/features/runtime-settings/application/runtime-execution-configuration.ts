import type { RuntimeId } from "@/features/runtime-settings/application/runtime-readiness"

export const runtimeReasoningEffortOrder = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
] as const

export type RuntimeReasoningEffort = (typeof runtimeReasoningEffortOrder)[number]

export type RuntimeExecutionConfiguration = Readonly<{
  model: string
  reasoningEffort: RuntimeReasoningEffort
}>

export type RuntimeModelOption = Readonly<{
  value: string
  label: string
  detail: string
  reasoningEfforts: readonly RuntimeReasoningEffort[]
  group?: string
}>

/** A per-runtime catalog as the installed CLI reports it, with a curated static fallback. */
export type RuntimeModelCatalog = Readonly<Record<RuntimeId, readonly RuntimeModelOption[]>>

// Mirror the 2026-08 Codex model manifest while retaining retired stored effort values.
const solEfforts: readonly RuntimeReasoningEffort[] = ["low", "medium", "high", "xhigh", "max"]
const terraEfforts: readonly RuntimeReasoningEffort[] = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
]
const lunaEfforts: readonly RuntimeReasoningEffort[] = ["low", "medium", "high", "xhigh", "max"]

// Claude Code passes the effort through as `--effort`.
const claudeEfforts: readonly RuntimeReasoningEffort[] = ["low", "medium", "high", "xhigh", "max"]

/** The fallback stands in only when a CLI catalog cannot be read; OpenCode lists no stable model. */
export const fallbackRuntimeModelCatalog: RuntimeModelCatalog = {
  codex: [
    {
      value: "gpt-5.6-sol",
      label: "GPT-5.6 Sol",
      detail: "Frontier Codex model for complex agentic work.",
      reasoningEfforts: solEfforts,
    },
    {
      value: "gpt-5.6-terra",
      label: "GPT-5.6 Terra",
      detail: "Balanced Codex model for everyday agentic work.",
      reasoningEfforts: terraEfforts,
    },
    {
      value: "gpt-5.6-luna",
      label: "GPT-5.6 Luna",
      detail: "Fast, lightweight Codex model.",
      reasoningEfforts: lunaEfforts,
    },
  ],
  claude: [
    {
      value: "claude-opus-5",
      label: "Opus 5",
      detail: "Highest capability and highest subscription usage.",
      reasoningEfforts: claudeEfforts,
    },
    {
      value: "claude-sonnet-5",
      label: "Sonnet 5",
      detail: "Balanced speed and capability.",
      reasoningEfforts: claudeEfforts,
    },
    {
      value: "claude-haiku-4-5",
      label: "Haiku 4.5",
      detail: "Fastest and lightest option. Does not accept a reasoning effort.",
      reasoningEfforts: [],
    },
  ],
  opencode: [],
}

const preferredDefaultModels: Partial<Readonly<Record<RuntimeId, string>>> = {
  codex: "gpt-5.6-luna",
  claude: "claude-sonnet-5",
}

const preferredDefaultEfforts: Readonly<Record<RuntimeId, RuntimeReasoningEffort>> = {
  codex: "max",
  claude: "high",
  opencode: "high",
}

const dynamicallyDiscoveredRuntimeIds: readonly RuntimeId[] = ["codex", "opencode"]

export function runtimeModelOptions(
  runtimeId: RuntimeId,
  catalog: RuntimeModelCatalog = fallbackRuntimeModelCatalog,
): readonly RuntimeModelOption[] {
  return catalog[runtimeId]
}

export function runtimeReasoningEfforts(
  runtimeId: RuntimeId,
  model: string,
  options: readonly RuntimeModelOption[] = fallbackRuntimeModelCatalog[runtimeId],
): readonly RuntimeReasoningEffort[] {
  return options.find((option) => option.value === model)?.reasoningEfforts ?? []
}

export function supportsReasoningEffort(
  runtimeId: RuntimeId,
  model: string,
  options?: readonly RuntimeModelOption[],
): boolean {
  return runtimeReasoningEfforts(runtimeId, model, options).length > 0
}

export function defaultRuntimeExecutionConfiguration(
  runtimeId: RuntimeId,
  options: readonly RuntimeModelOption[] = fallbackRuntimeModelCatalog[runtimeId],
): RuntimeExecutionConfiguration {
  const preferred = preferredDefaultModels[runtimeId]
  const option =
    (preferred ? options.find((candidate) => candidate.value === preferred) : undefined) ??
    options[0]
  if (!option) return { model: "", reasoningEffort: "none" }
  return resolveRuntimeConfiguration(runtimeId, option.value, undefined, options)
}

export function resolveRuntimeConfiguration(
  runtimeId: RuntimeId,
  model: string,
  preferredEffort?: RuntimeReasoningEffort,
  options: readonly RuntimeModelOption[] = fallbackRuntimeModelCatalog[runtimeId],
): RuntimeExecutionConfiguration {
  const efforts = runtimeReasoningEfforts(runtimeId, model, options)
  if (efforts.length === 0) return { model, reasoningEffort: "none" }
  const fallback = preferredDefaultEfforts[runtimeId]
  if (preferredEffort && efforts.includes(preferredEffort)) {
    return { model, reasoningEffort: preferredEffort }
  }
  return { model, reasoningEffort: efforts.includes(fallback) ? fallback : efforts[0] }
}

export function isRuntimeReasoningEffort(value: unknown): value is RuntimeReasoningEffort {
  return runtimeReasoningEffortOrder.includes(value as RuntimeReasoningEffort)
}

/** Without a read catalog a discovered runtime accepts any named model the CLI may report later. */
export function isRuntimeExecutionConfiguration(
  runtimeId: RuntimeId,
  value: unknown,
  options?: readonly RuntimeModelOption[],
): value is RuntimeExecutionConfiguration {
  if (!isRecord(value)) return false
  if (typeof value.model !== "string" || value.model === "") return false
  if (!isRuntimeReasoningEffort(value.reasoningEffort)) return false
  if (!options && dynamicallyDiscoveredRuntimeIds.includes(runtimeId)) return true
  const known = options ?? fallbackRuntimeModelCatalog[runtimeId]
  const option = known.find((candidate) => candidate.value === value.model)
  if (!option) return false
  return option.reasoningEfforts.length === 0
    ? value.reasoningEffort === "none"
    : option.reasoningEfforts.includes(value.reasoningEffort)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
