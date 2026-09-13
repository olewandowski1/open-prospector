import { describe, expect, it } from "vitest"
import type {
  RuntimeModelOption,
  RuntimeReasoningEffort,
} from "@/features/runtime-settings/application/runtime-execution-configuration"
import {
  groupRuntimeModelOptions,
  reasoningEffortLabel,
  runtimeExecutionLabel,
  runtimeModelLabel,
} from "@/features/runtime-settings/presentation/runtime-execution-presentation"

const opencodeOptions: readonly RuntimeModelOption[] = [
  {
    value: "opencode-go/hy3",
    label: "Hy3",
    detail: "Reported by the installed OpenCode CLI.",
    reasoningEfforts: [],
    group: "OpenCode Go",
  },
  {
    value: "opencode-go/deepseek-v4-pro",
    label: "DeepSeek V4 Pro (New)",
    detail: "Reported by the installed OpenCode CLI.",
    reasoningEfforts: ["high", "max"],
    group: "OpenCode Go",
  },
]

describe("reasoningEffortLabel", () => {
  it("reads every effort as words rather than an identifier", () => {
    const efforts: readonly RuntimeReasoningEffort[] = [
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra",
    ]
    expect(efforts.map(reasoningEffortLabel)).toEqual([
      "None",
      "Minimal",
      "Low",
      "Medium",
      "High",
      "Extra High",
      "Max",
      "Ultra",
    ])
  })
})

describe("runtimeModelLabel", () => {
  it("names a known model the way the run form offered it", () => {
    expect(runtimeModelLabel("codex", "gpt-5.6-luna")).toBe("GPT-5.6 Luna")
    expect(runtimeModelLabel("claude", "claude-sonnet-5")).toBe("Sonnet 5")
  })

  it("names a model from the catalog the form actually offered", () => {
    expect(runtimeModelLabel("opencode", "opencode-go/deepseek-v4-pro", opencodeOptions)).toBe(
      "DeepSeek V4 Pro (New)",
    )
  })

  it("keeps the slug of a model it does not know rather than inventing a name", () => {
    expect(runtimeModelLabel("codex", "gpt-reserve")).toBe("gpt-reserve")
    expect(runtimeModelLabel("opencode", "opencode/x-preview-f-free", opencodeOptions)).toBe(
      "opencode/x-preview-f-free",
    )
  })
})

describe("runtimeExecutionLabel", () => {
  it("says the model alone when the model takes no reasoning effort", () => {
    expect(
      runtimeExecutionLabel(
        "opencode",
        { model: "opencode-go/hy3", reasoningEffort: "none" },
        opencodeOptions,
      ),
    ).toBe("Hy3")
  })

  it("names the effort when there was one to choose", () => {
    expect(runtimeExecutionLabel("codex", { model: "gpt-5.6-luna", reasoningEffort: "max" })).toBe(
      "GPT-5.6 Luna · Max Reasoning",
    )
    expect(
      runtimeExecutionLabel(
        "opencode",
        { model: "opencode-go/deepseek-v4-pro", reasoningEffort: "high" },
        opencodeOptions,
      ),
    ).toBe("DeepSeek V4 Pro (New) · High Reasoning")
  })
})

describe("groupRuntimeModelOptions", () => {
  it("names the single plan a filtered catalog belongs to", () => {
    const groups = groupRuntimeModelOptions(opencodeOptions)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.label).toBe("OpenCode Go")
    expect(groups[0]?.options).toEqual(opencodeOptions)
  })

  it("keeps a catalog without provider groups in one section", () => {
    const ungrouped: readonly RuntimeModelOption[] = [
      { value: "a", label: "A", detail: "", reasoningEfforts: [] },
      { value: "b", label: "B", detail: "", reasoningEfforts: [] },
    ]
    const groups = groupRuntimeModelOptions(ungrouped)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.label).toBeUndefined()
    expect(groups[0]?.options).toHaveLength(2)
  })
})
