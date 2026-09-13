import { Effect, Either, Option } from "effect"

import {
  fallbackRuntimeModelCatalog,
  isRuntimeReasoningEffort,
  type RuntimeModelCatalog,
  type RuntimeModelOption,
  type RuntimeReasoningEffort,
  runtimeReasoningEffortOrder,
} from "@/features/runtime-settings/application/runtime-execution-configuration"
import {
  type RuntimeCommandLimits,
  type RuntimeId,
  RuntimeProbe,
  type RuntimeProbeService,
} from "@/features/runtime-settings/application/runtime-readiness"

// A catalog is much larger than a status probe, so it gets its own fixed bound.
const CATALOG_COMMAND_LIMITS: RuntimeCommandLimits = {
  timeoutMilliseconds: 30_000,
  outputLimitBytes: 1024 * 1024,
}

const TERMINAL_ESCAPE = String.fromCharCode(27)
const terminalColour = new RegExp(`${TERMINAL_ESCAPE}\\[[0-9;]*[a-zA-Z]`, "gu")

const modelIdentifier = /^[a-z0-9][a-z0-9-]*\/[A-Za-z0-9._-]+$/u

// The workspace runs on OpenCode Go; the CLI also reports Zen, DeepSeek, and MiniMax models.
const OPENCODE_GO_PROVIDER = "opencode-go"
const OPENCODE_GO_GROUP = "OpenCode Go"

/** Read the models the installed Codex and OpenCode CLIs report, falling back per runtime. */
export const discoverRuntimeModelCatalog: Effect.Effect<RuntimeModelCatalog, never, RuntimeProbe> =
  Effect.gen(function* () {
    const probe = yield* RuntimeProbe
    const [codex, opencode] = yield* Effect.all(
      [
        discoverRuntimeOptions(probe, "codex", ["debug", "models"], parseCodexModelCatalog),
        discoverRuntimeOptions(
          probe,
          "opencode",
          ["models", "--verbose"],
          parseOpencodeModelCatalog,
        ),
      ],
      { concurrency: "unbounded" },
    )
    return {
      codex,
      claude: fallbackRuntimeModelCatalog.claude,
      opencode,
    } satisfies RuntimeModelCatalog
  })

function discoverRuntimeOptions(
  probe: RuntimeProbeService,
  runtimeId: RuntimeId,
  arguments_: readonly string[],
  parse: (stdout: string) => readonly RuntimeModelOption[],
): Effect.Effect<readonly RuntimeModelOption[]> {
  return Effect.gen(function* () {
    const fallback = fallbackRuntimeModelCatalog[runtimeId]
    const executable = yield* probe.resolveExecutable(runtimeId)
    if (Option.isNone(executable)) return fallback
    const result = yield* Effect.either(
      probe.execute(executable.value, arguments_, CATALOG_COMMAND_LIMITS),
    )
    if (Either.isLeft(result)) return fallback
    const options = parse(result.right.stdout)
    return options.length > 0 ? options : fallback
  })
}

/** `opencode models --verbose` prints a bare identifier followed by one JSON object per model. */
export function parseOpencodeModelCatalog(stdout: string): readonly RuntimeModelOption[] {
  const options: RuntimeModelOption[] = []
  let identifier: string | undefined
  let metadata: string[] = []

  const collect = () => {
    if (identifier === undefined) return
    const option = opencodeModelOption(identifier, metadata.join("\n"))
    if (option) options.push(option)
    identifier = undefined
    metadata = []
  }

  for (const line of stripTerminalColour(stdout).split(/\r?\n/u)) {
    if (modelIdentifier.test(line)) {
      collect()
      identifier = line
      continue
    }
    if (identifier !== undefined) metadata.push(line)
  }
  collect()
  return options
}

function opencodeModelOption(identifier: string, metadata: string): RuntimeModelOption | undefined {
  if (!identifier.startsWith(`${OPENCODE_GO_PROVIDER}/`)) return undefined
  const record = parseJsonRecord(metadata)
  if (!record) return undefined
  const name = typeof record.name === "string" ? record.name.trim() : ""
  return {
    value: identifier,
    label: name === "" ? identifier : name,
    detail: "Reported by the installed OpenCode CLI.",
    reasoningEfforts: opencodeReasoningEfforts(record.variants),
    group: OPENCODE_GO_GROUP,
  }
}

function opencodeReasoningEfforts(variants: unknown): readonly RuntimeReasoningEffort[] {
  if (!isRecord(variants)) return []
  return runtimeReasoningEffortOrder.filter((effort) => Object.hasOwn(variants, effort))
}

/** `codex debug models` renders the model manifest as JSON, including internal-only entries. */
export function parseCodexModelCatalog(stdout: string): readonly RuntimeModelOption[] {
  const record = parseJsonRecord(stripTerminalColour(stdout))
  if (!record || !Array.isArray(record.models)) return []
  return record.models.flatMap((value) => {
    const option = codexModelOption(value)
    return option ? [option] : []
  })
}

function codexModelOption(value: unknown): RuntimeModelOption | undefined {
  if (!isRecord(value) || value.visibility !== "list") return undefined
  const slug = typeof value.slug === "string" ? value.slug.trim() : ""
  if (slug === "") return undefined
  const name = typeof value.display_name === "string" ? value.display_name.trim() : ""
  const description = typeof value.description === "string" ? value.description.trim() : ""
  return {
    value: slug,
    label: name === "" ? slug : runtimeModelLabelFromCliName(name),
    detail: description === "" ? "Reported by the installed Codex CLI." : description,
    reasoningEfforts: codexReasoningEfforts(value.supported_reasoning_levels),
  }
}

function codexReasoningEfforts(levels: unknown): readonly RuntimeReasoningEffort[] {
  if (!Array.isArray(levels)) return []
  const declared = new Set<RuntimeReasoningEffort>()
  for (const level of levels) {
    if (!isRecord(level) || typeof level.effort !== "string") continue
    if (isRuntimeReasoningEffort(level.effort)) declared.add(level.effort)
  }
  return runtimeReasoningEffortOrder.filter((effort) => declared.has(effort))
}

/** Codex writes `GPT-5.6-Sol` while the reader-facing convention is `GPT-5.6 Sol`. */
export function runtimeModelLabelFromCliName(name: string): string {
  const versioned = name.match(/^GPT-([\d.]+)(?:-(.+))?$/u)
  if (versioned) {
    const [, version, qualifier] = versioned
    return qualifier ? `GPT-${version} ${qualifier.replaceAll("-", " ")}` : `GPT-${version}`
  }
  const plain = name.match(/^GPT-(.+)$/u)
  return plain ? `GPT ${plain[1].replaceAll("-", " ")}` : name
}

function stripTerminalColour(text: string): string {
  return text.replace(terminalColour, "")
}

function parseJsonRecord(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text)
    return isRecord(value) ? value : undefined
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
