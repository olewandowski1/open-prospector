import { describe, expect, it } from "vitest"
import {
  defaultRuntimeExecutionConfiguration,
  fallbackRuntimeModelCatalog,
  isRuntimeExecutionConfiguration,
  type RuntimeModelOption,
  resolveRuntimeConfiguration,
  runtimeModelOptions,
  runtimeReasoningEfforts,
  supportsReasoningEffort,
} from "@/features/runtime-settings/application/runtime-execution-configuration"
import { runtimeIds } from "@/features/runtime-settings/application/runtime-readiness"

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

const codexOptions: readonly RuntimeModelOption[] = [
  {
    value: "gpt-6-astra",
    label: "GPT-6 Astra",
    detail: "Our most capable model for complex, demanding work.",
    reasoningEfforts: ["low", "medium", "high", "xhigh", "max", "ultra"],
  },
]

describe("runtime execution configuration", () => {
  it("offers OpenAI, Anthropic, and OpenCode subscription runtimes", () => {
    expect(runtimeIds).toEqual(["codex", "claude", "opencode"])
  })

  it("names Claude models with their versions", () => {
    expect(runtimeModelOptions("claude").map((model) => model.value)).toEqual([
      "claude-opus-5",
      "claude-sonnet-5",
      "claude-haiku-4-5",
    ])
  })

  it("keeps a static Codex fallback for a catalog the CLI cannot report", () => {
    expect(runtimeModelOptions("codex").map((model) => model.value)).toEqual([
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
    ])
  })

  it("lists no static OpenCode models because the installed CLI owns that catalog", () => {
    expect(runtimeModelOptions("opencode")).toEqual([])
  })

  it("prefers a discovered catalog over the static fallback", () => {
    const catalog = { ...fallbackRuntimeModelCatalog, opencode: opencodeOptions }
    expect(runtimeModelOptions("opencode", catalog)).toEqual(opencodeOptions)
  })

  it("exposes the effort ladder each model actually accepts", () => {
    expect(runtimeReasoningEfforts("claude", "claude-opus-5")).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ])
    expect(runtimeReasoningEfforts("codex", "gpt-5.6-sol")).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ])
    expect(
      runtimeReasoningEfforts("opencode", "opencode-go/deepseek-v4-pro", opencodeOptions),
    ).toEqual(["high", "max"])
  })

  it("offers Ultra where the model manifest documents it and Max on every current Codex model", () => {
    expect(runtimeReasoningEfforts("codex", "gpt-5.6-terra")).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra",
    ])
    expect(runtimeReasoningEfforts("codex", "gpt-5.6-luna")).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ])
    for (const model of ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]) {
      expect(runtimeReasoningEfforts("codex", model)).not.toContain("none")
      expect(runtimeReasoningEfforts("codex", model)).not.toContain("minimal")
    }
  })

  it("reports models that take no reasoning effort", () => {
    expect(supportsReasoningEffort("claude", "claude-haiku-4-5")).toBe(false)
    expect(runtimeReasoningEfforts("claude", "claude-haiku-4-5")).toEqual([])
    expect(supportsReasoningEffort("claude", "claude-sonnet-5")).toBe(true)
    expect(supportsReasoningEffort("opencode", "opencode-go/hy3", opencodeOptions)).toBe(false)
  })

  it("resolves a default model and effort from a discovered catalog", () => {
    expect(defaultRuntimeExecutionConfiguration("opencode", opencodeOptions)).toEqual({
      model: "opencode-go/hy3",
      reasoningEffort: "none",
    })
    expect(defaultRuntimeExecutionConfiguration("codex", codexOptions)).toEqual({
      model: "gpt-6-astra",
      reasoningEffort: "max",
    })
  })

  it("prefers the product default model when the catalog carries it", () => {
    const options: readonly RuntimeModelOption[] = [
      {
        value: "opencode-go/hy3",
        label: "Hy3",
        detail: "Reported by the installed OpenCode CLI.",
        reasoningEfforts: [],
        group: "OpenCode Go",
      },
      {
        value: "opencode-go/deepseek-v4.1-flash",
        label: "DeepSeek V4.1 Flash",
        detail: "Reported by the installed OpenCode CLI.",
        reasoningEfforts: ["low", "high", "max"],
        group: "OpenCode Go",
      },
    ]

    expect(defaultRuntimeExecutionConfiguration("opencode", options)).toEqual({
      model: "opencode-go/deepseek-v4.1-flash",
      reasoningEffort: "high",
    })
  })

  it("keeps a preferred effort the new model still supports", () => {
    expect(resolveRuntimeConfiguration("claude", "claude-opus-5", "max")).toEqual({
      model: "claude-opus-5",
      reasoningEffort: "max",
    })
    expect(
      resolveRuntimeConfiguration(
        "opencode",
        "opencode-go/deepseek-v4-pro",
        "max",
        opencodeOptions,
      ),
    ).toEqual({ model: "opencode-go/deepseek-v4-pro", reasoningEffort: "max" })
  })

  it("falls back to a supported effort when the preferred one is not offered", () => {
    expect(resolveRuntimeConfiguration("claude", "claude-opus-5", "minimal")).toEqual({
      model: "claude-opus-5",
      reasoningEffort: "high",
    })
    expect(resolveRuntimeConfiguration("claude", "claude-haiku-4-5", "high")).toEqual({
      model: "claude-haiku-4-5",
      reasoningEffort: "none",
    })
    expect(
      resolveRuntimeConfiguration(
        "opencode",
        "opencode-go/deepseek-v4-pro",
        "low",
        opencodeOptions,
      ),
    ).toEqual({ model: "opencode-go/deepseek-v4-pro", reasoningEffort: "high" })
  })

  it("refuses a stored model the discovered catalog dropped", () => {
    expect(
      isRuntimeExecutionConfiguration(
        "opencode",
        { model: "opencode/x-preview-f-free", reasoningEffort: "high" },
        opencodeOptions,
      ),
    ).toBe(false)
  })

  it("accepts exactly the variants a discovered OpenCode model offers", () => {
    expect(
      isRuntimeExecutionConfiguration(
        "opencode",
        { model: "opencode-go/deepseek-v4-pro", reasoningEffort: "high" },
        opencodeOptions,
      ),
    ).toBe(true)
    expect(
      isRuntimeExecutionConfiguration(
        "opencode",
        { model: "opencode-go/deepseek-v4-pro", reasoningEffort: "low" },
        opencodeOptions,
      ),
    ).toBe(false)
    expect(
      isRuntimeExecutionConfiguration(
        "opencode",
        { model: "opencode-go/hy3", reasoningEffort: "none" },
        opencodeOptions,
      ),
    ).toBe(true)
    expect(
      isRuntimeExecutionConfiguration(
        "opencode",
        { model: "opencode-go/hy3", reasoningEffort: "high" },
        opencodeOptions,
      ),
    ).toBe(false)
  })

  it("accepts any named model of a discovered runtime until its catalog is read", () => {
    expect(
      isRuntimeExecutionConfiguration("opencode", {
        model: "opencode-go/deepseek-v4.1-flash",
        reasoningEffort: "high",
      }),
    ).toBe(true)
    expect(
      isRuntimeExecutionConfiguration("codex", {
        model: "gpt-6-astra",
        reasoningEffort: "ultra",
      }),
    ).toBe(true)
    expect(
      isRuntimeExecutionConfiguration("opencode", { model: "", reasoningEffort: "high" }),
    ).toBe(false)
    expect(
      isRuntimeExecutionConfiguration("opencode", { model: "x/y", reasoningEffort: "bogus" }),
    ).toBe(false)
  })

  it("rejects an effort the selected model does not accept", () => {
    expect(
      isRuntimeExecutionConfiguration("claude", {
        model: "claude-haiku-4-5",
        reasoningEffort: "high",
      }),
    ).toBe(false)
    expect(
      isRuntimeExecutionConfiguration("claude", {
        model: "claude-opus-5",
        reasoningEffort: "none",
      }),
    ).toBe(false)
    expect(
      isRuntimeExecutionConfiguration("claude", { model: "sonnet", reasoningEffort: "high" }),
    ).toBe(false)
  })

  it("accepts every runtime default that names a model", () => {
    expect(
      isRuntimeExecutionConfiguration("codex", defaultRuntimeExecutionConfiguration("codex")),
    ).toBe(true)
    expect(
      isRuntimeExecutionConfiguration("claude", defaultRuntimeExecutionConfiguration("claude")),
    ).toBe(true)
  })
})
