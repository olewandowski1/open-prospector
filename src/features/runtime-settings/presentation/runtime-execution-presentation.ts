import type {
  RuntimeModelOption,
  RuntimeReasoningEffort,
} from "@/features/runtime-settings/application/runtime-execution-configuration"
import { fallbackRuntimeModelCatalog } from "@/features/runtime-settings/application/runtime-execution-configuration"
import type { RuntimeId } from "@/features/runtime-settings/application/runtime-readiness"

const labels: Record<RuntimeReasoningEffort, string> = {
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  max: "Max",
  ultra: "Ultra",
}

export type RuntimeModelGroup = Readonly<{
  label?: string
  options: readonly RuntimeModelOption[]
}>

/** Present stored CLI effort identifiers as reader-facing labels. */
export function reasoningEffortLabel(effort: RuntimeReasoningEffort): string {
  return labels[effort]
}

/** Preserve unknown or retired model slugs instead of inventing a label. */
export function runtimeModelLabel(
  runtimeId: RuntimeId,
  model: string,
  options: readonly RuntimeModelOption[] = fallbackRuntimeModelCatalog[runtimeId],
): string {
  return options.find((option) => option.value === model)?.label ?? model
}

/** Omit the stored `none` effort because it is not a reader-facing value. */
export function runtimeExecutionLabel(
  runtimeId: RuntimeId,
  configuration: Readonly<{ model: string; reasoningEffort: RuntimeReasoningEffort }>,
  options?: readonly RuntimeModelOption[],
): string {
  const model = runtimeModelLabel(runtimeId, configuration.model, options)
  if (configuration.reasoningEffort === "none") return model
  return `${model} · ${reasoningEffortLabel(configuration.reasoningEffort)} Reasoning`
}

/** Keep CLI order and split only where the provider changes. */
export function groupRuntimeModelOptions(
  options: readonly RuntimeModelOption[],
): readonly RuntimeModelGroup[] {
  const groups: { label?: string; options: RuntimeModelOption[] }[] = []
  for (const option of options) {
    const current = groups[groups.length - 1]
    if (!current || current.label !== option.group) {
      groups.push({ ...(option.group ? { label: option.group } : {}), options: [option] })
      continue
    }
    current.options.push(option)
  }
  return groups
}
