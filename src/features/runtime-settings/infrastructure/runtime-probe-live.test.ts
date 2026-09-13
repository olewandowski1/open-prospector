import { Effect, Either, Option } from "effect"
import { describe, expect, it } from "vitest"

import {
  executeRuntimeCommand,
  resolveRuntimeExecutable,
} from "@/features/runtime-settings/infrastructure/runtime-probe-live"

describe("runtime probe infrastructure", () => {
  it("passes arguments literally without a shell", async () => {
    const result = await Effect.runPromise(
      executeRuntimeCommand(process.execPath, [
        "-e",
        "process.stdout.write(process.argv[1])",
        "$(echo should-not-run)",
      ]),
    )

    expect(result.stdout).toBe("$(echo should-not-run)")
  })

  it("bounds command output", async () => {
    const result = await Effect.runPromise(
      Effect.either(
        executeRuntimeCommand(process.execPath, [
          "-e",
          `process.stdout.write("x".repeat(${70 * 1024}))`,
        ]),
      ),
    )

    expect(Either.isLeft(result)).toBe(true)
    if (Either.isLeft(result)) expect(result.left.reason).toBe("output-limit")
  })

  it("accepts a larger output limit for a model catalog read", async () => {
    const result = await Effect.runPromise(
      executeRuntimeCommand(
        process.execPath,
        ["-e", `process.stdout.write("x".repeat(${70 * 1024}))`],
        process.env,
        5_000,
        1024 * 1024,
      ),
    )

    expect(result.stdout).toHaveLength(70 * 1024)
  })

  it("interrupts a command through the Effect timeout", async () => {
    const result = await Effect.runPromise(
      Effect.either(
        executeRuntimeCommand(
          process.execPath,
          ["-e", "setInterval(() => undefined, 1_000)"],
          process.env,
          20,
        ),
      ),
    )

    expect(Either.isLeft(result)).toBe(true)
    if (Either.isLeft(result)) expect(result.left.reason).toBe("timeout")
  })

  it("contains synchronous spawn failures", async () => {
    const result = await Effect.runPromise(
      Effect.either(executeRuntimeCommand("invalid\0executable", [])),
    )

    expect(Either.isLeft(result)).toBe(true)
    if (Either.isLeft(result)) expect(result.left.reason).toBe("spawn")
  })

  it("does not forward provider API credentials", async () => {
    const result = await Effect.runPromise(
      executeRuntimeCommand(
        process.execPath,
        ["-e", "process.stdout.write(process.env.OPENAI_API_KEY ?? 'absent')"],
        { ...process.env, OPENAI_API_KEY: "secret-value" },
      ),
    )

    expect(result.stdout).toBe("absent")
  })

  it("uses the same provider configuration home as runtime execution", async () => {
    const result = await Effect.runPromise(
      executeRuntimeCommand(
        process.execPath,
        ["-e", "process.stdout.write(process.env.CODEX_HOME ?? 'absent')"],
        { ...process.env, CODEX_HOME: "provider-owned-config" },
      ),
    )

    expect(result.stdout).toBe("provider-owned-config")
  })

  it("accepts an absolute application configuration override", async () => {
    const executable = await resolveRuntimeExecutable("codex", {
      PROSPECTOR_CODEX_EXECUTABLE: process.execPath,
      NODE_ENV: "test",
    }).pipe(Effect.runPromise)

    expect(Option.getOrUndefined(executable)).toBe(process.execPath)
  })
})
