import { Context, Data, Effect, Either, Option } from "effect"

export const runtimeIds = ["codex", "claude", "opencode"] as const
export type RuntimeId = (typeof runtimeIds)[number]

export function isRuntimeId(value: string): value is RuntimeId {
  return runtimeIds.some((runtimeId) => runtimeId === value)
}
export type RuntimeReadinessStatus =
  | "Ready"
  | "Missing"
  | "Logged Out"
  | "Unreachable"
  | "Unsupported Version"

export type RuntimeReadiness = Readonly<{
  runtimeId: RuntimeId
  label: string
  status: RuntimeReadinessStatus
  version?: string
  detail: string
  terminalInstruction?: string
}>

export type RuntimeCommandResult = Readonly<{
  exitCode: number
  stdout: string
  stderr: string
}>

export type RuntimeCommandLimits = Readonly<{
  timeoutMilliseconds: number
  outputLimitBytes: number
}>

export class RuntimeCommandError extends Data.TaggedError("RuntimeCommandError")<{
  readonly reason: "spawn" | "timeout" | "output-limit"
}> {}

export interface RuntimeProbeService {
  readonly resolveExecutable: (runtimeId: RuntimeId) => Effect.Effect<Option.Option<string>>
  readonly execute: (
    executable: string,
    arguments_: readonly string[],
    limits?: RuntimeCommandLimits,
  ) => Effect.Effect<RuntimeCommandResult, RuntimeCommandError>
}

export class RuntimeProbe extends Context.Tag("RuntimeSettings/RuntimeProbe")<
  RuntimeProbe,
  RuntimeProbeService
>() {}

type AuthenticationState = "ready" | "logged-out" | "unsupported"

type RuntimeDefinition = Readonly<{
  id: RuntimeId
  label: string
  versionArguments: readonly string[]
  authenticationArguments: readonly string[]
  minimumVersion: readonly [number, number, number]
  parseAuthentication(result: RuntimeCommandResult): AuthenticationState
  installInstruction: string
  loginInstruction: string
  updateInstruction: string
  readyDetail: string
}>

const runtimeDefinitions: Record<RuntimeId, RuntimeDefinition> = {
  codex: {
    id: "codex",
    label: "Codex",
    versionArguments: ["--version"],
    authenticationArguments: ["login", "status"],
    minimumVersion: [0, 1, 0],
    parseAuthentication: ({ exitCode, stdout, stderr }) => {
      const output = `${stdout}\n${stderr}`
      if (/not logged in/iu.test(output)) return "logged-out"
      if (exitCode === 0 && /^logged in using chatgpt\s*$/iu.test(output.trim())) return "ready"
      return "unsupported"
    },
    installInstruction: "Run: npm install -g @openai/codex, then: codex login",
    loginInstruction: "Run in your terminal: codex login",
    updateInstruction: "Run: codex update",
    readyDetail: "Subscription login reported by the official CLI.",
  },
  opencode: {
    id: "opencode",
    label: "OpenCode",
    versionArguments: ["--version"],
    authenticationArguments: ["providers", "list"],
    // Treat the hosted catalog as a functional probe because it works without provider login.
    minimumVersion: [1, 18, 0],
    parseAuthentication: ({ exitCode }) => (exitCode === 0 ? "ready" : "unsupported"),
    installInstruction: "Run: npm install -g opencode-ai",
    loginInstruction: "Optional. Run in your terminal: opencode providers login",
    updateInstruction: "Run: opencode upgrade",
    readyDetail: "Hosted catalog available; provider login optional.",
  },
  claude: {
    id: "claude",
    label: "Claude",
    versionArguments: ["--version"],
    authenticationArguments: ["auth", "status", "--json"],
    minimumVersion: [1, 0, 0],
    parseAuthentication: ({ stdout }) => {
      if (/"(?:accessToken|token|apiKey|secret)"\s*:/iu.test(stdout)) return "unsupported"
      try {
        const value: unknown = JSON.parse(stdout)
        if (!isRecord(value) || !isSupportedClaudeStatus(value)) return "unsupported"
        if (!value.loggedIn) return "logged-out"
        const subscriptionType = value.subscriptionType.toLowerCase()
        return ["pro", "max", "team", "enterprise"].includes(subscriptionType)
          ? "ready"
          : "logged-out"
      } catch {
        return "unsupported"
      }
    },
    installInstruction:
      "Windows: irm https://claude.ai/install.ps1 | iex. macOS/Linux: curl -fsSL https://claude.ai/install.sh | bash. Then run: claude auth login",
    loginInstruction: "Run in your terminal: claude auth login",
    updateInstruction: "Run: claude install stable",
    readyDetail: "Subscription login reported by the official CLI.",
  },
}

export const getRuntimeReadiness = (runtimeId: RuntimeId) =>
  Effect.gen(function* () {
    const definition = runtimeDefinitions[runtimeId]
    const probe = yield* RuntimeProbe
    const executable = yield* probe.resolveExecutable(runtimeId)

    if (Option.isNone(executable)) {
      return readiness(definition, "Missing", "Executable not found.", {
        terminalInstruction: definition.installInstruction,
      })
    }

    const versionResult = yield* Effect.either(
      probe.execute(executable.value, definition.versionArguments),
    )
    if (Either.isLeft(versionResult)) {
      return readiness(definition, "Unreachable", "The executable could not be checked.", {
        terminalInstruction: "Verify the executable in your terminal, then retry.",
      })
    }

    const version = parseVersion(versionResult.right)
    if (!version || !meetsMinimumVersion(version.parts, definition.minimumVersion)) {
      return readiness(definition, "Unsupported Version", "The installed CLI is not supported.", {
        version: version?.display,
        terminalInstruction: definition.updateInstruction,
      })
    }

    const authentication = yield* Effect.either(
      probe.execute(executable.value, definition.authenticationArguments),
    )
    if (Either.isLeft(authentication)) {
      return readiness(definition, "Unreachable", "Authentication status could not be checked.", {
        version: version.display,
        terminalInstruction: "Run the CLI status command in your terminal, then retry.",
      })
    }

    const state = definition.parseAuthentication(authentication.right)
    if (state === "logged-out") {
      return readiness(definition, "Logged Out", "The CLI reports no active subscription login.", {
        version: version.display,
        terminalInstruction: definition.loginInstruction,
      })
    }
    if (state === "unsupported") {
      return readiness(
        definition,
        "Unsupported Version",
        "The CLI returned an unsupported status response.",
        { version: version.display, terminalInstruction: definition.updateInstruction },
      )
    }

    return readiness(definition, "Ready", definition.readyDetail, {
      version: version.display,
    })
  })

export const getAllRuntimeReadiness = Effect.all(
  runtimeIds.map((runtimeId) => getRuntimeReadiness(runtimeId)),
  { concurrency: 2 },
)

function readiness(
  definition: RuntimeDefinition,
  status: RuntimeReadinessStatus,
  detail: string,
  optional: Pick<RuntimeReadiness, "version" | "terminalInstruction"> = {},
): RuntimeReadiness {
  return { runtimeId: definition.id, label: definition.label, status, detail, ...optional }
}

function parseVersion(
  result: RuntimeCommandResult,
): Readonly<{ parts: readonly [number, number, number]; display: string }> | undefined {
  if (result.exitCode !== 0) return undefined
  const match = `${result.stdout}\n${result.stderr}`.match(/(?:^|\s)v?(\d+)\.(\d+)\.(\d+)(?:\s|$)/u)
  if (!match) return undefined
  return {
    parts: [Number(match[1]), Number(match[2]), Number(match[3])],
    display: `${match[1]}.${match[2]}.${match[3]}`,
  }
}

function meetsMinimumVersion(
  version: readonly [number, number, number],
  minimum: readonly [number, number, number],
): boolean {
  for (let index = 0; index < version.length; index += 1) {
    if (version[index] > minimum[index]) return true
    if (version[index] < minimum[index]) return false
  }
  return true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// Refusing an unrecognised field let an upstream addition disable the runtime, so only credentials are.
const CREDENTIAL_KEY = /token|secret|apikey|password|credential/iu

function isSupportedClaudeStatus(
  value: Record<string, unknown>,
): value is Record<string, unknown> & { loggedIn: boolean; subscriptionType: string } {
  return (
    Object.keys(value).every((key) => !CREDENTIAL_KEY.test(key)) &&
    typeof value.loggedIn === "boolean" &&
    (!value.loggedIn || typeof value.subscriptionType === "string")
  )
}

export function runtimeDescriptor(runtimeId: RuntimeId): Readonly<{
  label: string
  versionArguments: readonly string[]
  installInstruction: string
  updateInstruction: string
}> {
  const definition = runtimeDefinitions[runtimeId]
  return {
    label: definition.label,
    versionArguments: definition.versionArguments,
    installInstruction: definition.installInstruction,
    updateInstruction: definition.updateInstruction,
  }
}

export function parseRuntimeVersion(result: RuntimeCommandResult): string | undefined {
  return parseVersion(result)?.display
}
