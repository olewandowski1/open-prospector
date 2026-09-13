import { Effect, Layer, Option } from "effect"
import { describe, expect, it, vi } from "vitest"

import { fallbackRuntimeModelCatalog } from "@/features/runtime-settings/application/runtime-execution-configuration"
import {
  discoverRuntimeModelCatalog,
  parseCodexModelCatalog,
  parseOpencodeModelCatalog,
  runtimeModelLabelFromCliName,
} from "@/features/runtime-settings/application/runtime-model-catalog"
import {
  RuntimeCommandError,
  RuntimeProbe,
  type RuntimeProbeService,
} from "@/features/runtime-settings/application/runtime-readiness"

const terminalColour = String.fromCharCode(27)

const opencodeStdout = [
  `${terminalColour}[90mopencode/big-pickle${terminalColour}[0m`,
  "{",
  '  "id": "big-pickle",',
  '  "providerID": "opencode",',
  '  "name": "Big Pickle",',
  '  "variants": {}',
  "}",
  "opencode-go/broken-record",
  "not json at all",
  "opencode-go/deepseek-v4-pro",
  "{",
  '  "id": "deepseek-v4-pro",',
  '  "providerID": "opencode-go",',
  '  "name": "DeepSeek V4 Pro (New)",',
  '  "variants": {',
  '    "high": { "reasoningEffort": "high" },',
  '    "max": { "reasoningEffort": "max" }',
  "  }",
  "}",
].join("\n")

const codexStdout = JSON.stringify({
  models: [
    {
      slug: "gpt-6-astra",
      display_name: "GPT-6-Astra",
      description: "Our most capable model for complex, demanding work.",
      visibility: "list",
      supported_reasoning_levels: [
        { effort: "low" },
        { effort: "medium" },
        { effort: "high" },
        { effort: "xhigh" },
        { effort: "max" },
        { effort: "ultra" },
      ],
    },
    {
      slug: "gpt-reserve",
      display_name: "GPT-Reserve",
      description: "Internal only.",
      visibility: "hide",
      supported_reasoning_levels: [{ effort: "low" }],
    },
    {
      slug: "gpt-5.5",
      display_name: "GPT-5.5",
      description: "Previous generation.",
      visibility: "list",
      supported_reasoning_levels: [{ effort: "low" }, { effort: "medium" }],
    },
  ],
})

const executable = (runtimeId: string) => Effect.succeed(Option.some(`/bin/${runtimeId}`))

const probeWithExecute = (execute: RuntimeProbeService["execute"]): RuntimeProbeService => ({
  resolveExecutable: (runtimeId) => executable(runtimeId),
  execute,
})

describe("parseOpencodeModelCatalog", () => {
  it("keeps OpenCode Go models with their display names and variants", () => {
    expect(parseOpencodeModelCatalog(opencodeStdout)).toEqual([
      {
        value: "opencode-go/deepseek-v4-pro",
        label: "DeepSeek V4 Pro (New)",
        detail: "Reported by the installed OpenCode CLI.",
        reasoningEfforts: ["high", "max"],
        group: "OpenCode Go",
      },
    ])
  })

  it("drops models from every other provider the CLI reports", () => {
    expect(parseOpencodeModelCatalog(opencodeStdout).map((model) => model.value)).toEqual([
      "opencode-go/deepseek-v4-pro",
    ])
  })

  it("drops a record whose metadata is not JSON and keeps the records around it", () => {
    expect(parseOpencodeModelCatalog(opencodeStdout).map((model) => model.value)).not.toContain(
      "opencode-go/broken-record",
    )
  })
})

describe("parseCodexModelCatalog", () => {
  it("lists only visible models with their manifest label and effort ladder", () => {
    expect(parseCodexModelCatalog(codexStdout)).toEqual([
      {
        value: "gpt-6-astra",
        label: "GPT-6 Astra",
        detail: "Our most capable model for complex, demanding work.",
        reasoningEfforts: ["low", "medium", "high", "xhigh", "max", "ultra"],
      },
      {
        value: "gpt-5.5",
        label: "GPT-5.5",
        detail: "Previous generation.",
        reasoningEfforts: ["low", "medium"],
      },
    ])
  })

  it("returns nothing rather than throwing on unreadable output", () => {
    expect(parseCodexModelCatalog("codex-cli 0.99.0")).toEqual([])
  })
})

describe("runtimeModelLabelFromCliName", () => {
  it("spaces the qualifier while keeping the version hyphen", () => {
    expect(runtimeModelLabelFromCliName("GPT-6-Astra")).toBe("GPT-6 Astra")
    expect(runtimeModelLabelFromCliName("GPT-5.6-Sol")).toBe("GPT-5.6 Sol")
    expect(runtimeModelLabelFromCliName("GPT-5.5")).toBe("GPT-5.5")
    expect(runtimeModelLabelFromCliName("GPT-Reserve")).toBe("GPT Reserve")
    expect(runtimeModelLabelFromCliName("Claude Fable 5")).toBe("Claude Fable 5")
  })
})

describe("discoverRuntimeModelCatalog", () => {
  it("reads Codex and OpenCode while keeping Claude static", async () => {
    const execute = vi.fn<RuntimeProbeService["execute"]>((_executable, arguments_) =>
      Effect.succeed({
        exitCode: 0,
        stdout: arguments_.includes("debug") ? codexStdout : opencodeStdout,
        stderr: "",
      }),
    )
    const catalog = await Effect.runPromise(
      discoverRuntimeModelCatalog.pipe(
        Effect.provide(Layer.succeed(RuntimeProbe, probeWithExecute(execute))),
      ),
    )

    expect(catalog.codex.map((model) => model.value)).toEqual(["gpt-6-astra", "gpt-5.5"])
    expect(catalog.opencode.map((model) => model.value)).toEqual(["opencode-go/deepseek-v4-pro"])
    expect(catalog.claude).toEqual(fallbackRuntimeModelCatalog.claude)
    expect(execute).toHaveBeenCalledWith(
      "/bin/opencode",
      ["models", "--verbose"],
      expect.objectContaining({ outputLimitBytes: 1024 * 1024 }),
    )
    expect(execute).toHaveBeenCalledWith(
      "/bin/codex",
      ["debug", "models"],
      expect.objectContaining({ outputLimitBytes: 1024 * 1024 }),
    )
  })

  it("falls back per runtime when one catalog command fails", async () => {
    const catalog = await Effect.runPromise(
      discoverRuntimeModelCatalog.pipe(
        Effect.provide(
          Layer.succeed(
            RuntimeProbe,
            probeWithExecute((_executable, arguments_) =>
              arguments_.includes("debug")
                ? Effect.fail(new RuntimeCommandError({ reason: "timeout" }))
                : Effect.succeed({ exitCode: 0, stdout: opencodeStdout, stderr: "" }),
            ),
          ),
        ),
      ),
    )

    expect(catalog.codex).toEqual(fallbackRuntimeModelCatalog.codex)
    expect(catalog.opencode.map((model) => model.value)).toEqual(["opencode-go/deepseek-v4-pro"])
  })

  it("falls back when a runtime executable is missing", async () => {
    const catalog = await Effect.runPromise(
      discoverRuntimeModelCatalog.pipe(
        Effect.provide(
          Layer.succeed(RuntimeProbe, {
            resolveExecutable: () => Effect.succeed(Option.none()),
            execute: () => Effect.die("should not execute"),
          }),
        ),
      ),
    )

    expect(catalog).toEqual(fallbackRuntimeModelCatalog)
  })
})
