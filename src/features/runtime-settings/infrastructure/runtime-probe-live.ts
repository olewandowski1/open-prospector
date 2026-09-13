import { type ChildProcessByStdio, spawn } from "node:child_process"
import { constants } from "node:fs"
import { access } from "node:fs/promises"
import { isAbsolute, join, delimiter as pathDelimiter } from "node:path"
import type { Readable } from "node:stream"

import { Effect, Layer, Option } from "effect"

import {
  RuntimeCommandError,
  type RuntimeCommandResult,
  type RuntimeId,
  RuntimeProbe,
} from "@/features/runtime-settings/application/runtime-readiness"
import {
  buildSafeRuntimeEnvironment,
  terminateRuntimeProcessTree,
} from "@/features/runtime-settings/infrastructure/runtime-process"

const COMMAND_TIMEOUT_MILLISECONDS = 5_000
const COMMAND_OUTPUT_LIMIT_BYTES = 64 * 1024

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>

export function executeRuntimeCommand(
  executable: string,
  arguments_: readonly string[],
  environment: RuntimeEnvironment = process.env,
  timeoutMilliseconds = COMMAND_TIMEOUT_MILLISECONDS,
  outputLimitBytes = COMMAND_OUTPUT_LIMIT_BYTES,
): Effect.Effect<RuntimeCommandResult, RuntimeCommandError> {
  return Effect.async<RuntimeCommandResult, RuntimeCommandError>((resume) => {
    let child: ChildProcessByStdio<null, Readable, Readable>
    try {
      child = spawn(executable, arguments_, {
        detached: process.platform !== "win32",
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: buildSafeRuntimeEnvironment(environment),
      })
    } catch {
      resume(Effect.fail(new RuntimeCommandError({ reason: "spawn" })))
      return
    }
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let outputBytes = 0
    let settled = false

    const finish = (effect: Effect.Effect<RuntimeCommandResult, RuntimeCommandError>): void => {
      if (settled) return
      settled = true
      resume(effect)
    }

    const collect = (target: Buffer[], chunk: Buffer): void => {
      outputBytes += chunk.byteLength
      if (outputBytes > outputLimitBytes) {
        terminateRuntimeProcessTree(child)
        finish(Effect.fail(new RuntimeCommandError({ reason: "output-limit" })))
        return
      }
      target.push(chunk)
    }

    child.stdout.on("data", (chunk: Buffer) => collect(stdout, chunk))
    child.stderr.on("data", (chunk: Buffer) => collect(stderr, chunk))
    child.on("error", () => finish(Effect.fail(new RuntimeCommandError({ reason: "spawn" }))))
    child.on("close", (exitCode) =>
      finish(
        Effect.succeed({
          exitCode: exitCode ?? -1,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
        }),
      ),
    )

    return Effect.sync(() => {
      if (!settled) terminateRuntimeProcessTree(child)
    })
  }).pipe(
    Effect.timeoutFail({
      duration: timeoutMilliseconds,
      onTimeout: () => new RuntimeCommandError({ reason: "timeout" }),
    }),
  )
}

export function resolveRuntimeExecutable(
  runtimeId: RuntimeId,
  environment: RuntimeEnvironment = process.env,
  platform = process.platform,
  architecture = process.arch,
): Effect.Effect<Option.Option<string>> {
  return Effect.promise(async () => {
    for (const candidate of executableCandidates(runtimeId, environment, platform, architecture)) {
      try {
        await access(candidate, constants.X_OK)
        return Option.some(candidate)
      } catch {}
    }
    return Option.none()
  })
}

function executableCandidates(
  runtimeId: RuntimeId,
  environment: RuntimeEnvironment,
  platform: NodeJS.Platform,
  architecture: string,
): readonly string[] {
  const executableName = platform === "win32" ? `${runtimeId}.exe` : runtimeId
  const overrideKey = `PROSPECTOR_${runtimeId.toUpperCase()}_EXECUTABLE`
  const configured = environment[overrideKey]
  const candidates = configured && isAbsolute(configured) ? [configured] : []

  for (const directory of (environment.PATH ?? "").split(pathDelimiter).filter(Boolean)) {
    candidates.push(join(directory, executableName))
  }

  const userDirectory = environment.USERPROFILE ?? environment.HOME
  if (userDirectory) {
    candidates.push(join(userDirectory, ".local", "bin", executableName))
  }

  if (runtimeId === "codex" && platform === "win32" && environment.APPDATA) {
    const packageArchitecture = architecture === "arm64" ? "arm64" : "x64"
    const targetArchitecture = architecture === "arm64" ? "aarch64" : "x86_64"
    candidates.push(
      join(
        environment.APPDATA,
        "npm",
        "node_modules",
        "@openai",
        "codex",
        "node_modules",
        "@openai",
        `codex-win32-${packageArchitecture}`,
        "vendor",
        `${targetArchitecture}-pc-windows-msvc`,
        "bin",
        "codex.exe",
      ),
    )
  }

  // The npm shim for OpenCode is a .cmd wrapper; spawn needs the real executable it hides.
  if (runtimeId === "opencode" && platform === "win32" && environment.APPDATA) {
    candidates.push(
      join(environment.APPDATA, "npm", "node_modules", "opencode-ai", "bin", "opencode.exe"),
    )
  }

  return [...new Set(candidates)]
}

export const RuntimeProbeLive = Layer.succeed(RuntimeProbe, {
  resolveExecutable: (runtimeId) => resolveRuntimeExecutable(runtimeId),
  execute: (executable, arguments_, limits) =>
    executeRuntimeCommand(
      executable,
      arguments_,
      process.env,
      limits?.timeoutMilliseconds,
      limits?.outputLimitBytes,
    ),
})
