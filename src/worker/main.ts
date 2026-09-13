import { Console, Effect, Layer, Option } from "effect"

import {
  makeDiscoveryTaskExecutor,
  makeReassessmentSeedTaskExecutor,
  makeSqliteDiscoveryRepository,
  makeSubscriptionDiscoveryRuntime,
} from "@/features/business-discovery/worker"
import {
  makeAbsenceConfirmationExecutor,
  makeIdentityTaskExecutor,
  makeSqliteIdentityRepository,
} from "@/features/business-identity/worker"
import {
  closeSharedDatabases,
  loadLocalApplicationConfig,
  migrateLocalDatabase,
} from "@/features/local-application"
import { makeScoreCandidateTaskExecutor } from "@/features/review-queue/worker"
import { loadWorkerConfiguration, runWorker } from "@/features/run-execution/application/worker"
import { sqliteRunTaskRepositoryLive } from "@/features/run-execution/infrastructure/sqlite-run-task-repository"
import { stageExecutorLive } from "@/features/run-execution/infrastructure/stage-executor-live"
import { executeRuntimeCommand, resolveRuntimeExecutable } from "@/features/runtime-settings/worker"
import {
  makeAssessmentTaskExecutor,
  makeClaudeAssessmentRuntime,
  makeCodexAssessmentRuntime,
  makeOpencodeAssessmentRuntime,
  makeSqliteAssessmentRepository,
} from "@/features/website-assessment/worker"
import {
  makeInspectionTaskExecutor,
  makePlaywrightWebsiteInspector,
  makeSqliteInspectionRepository,
} from "@/features/website-inspection/worker"
import { tryAcquireWorkspaceOperationLease } from "@/features/workspace-administration"

const localConfig = loadLocalApplicationConfig()
const executeInspection = makeInspectionTaskExecutor(
  makePlaywrightWebsiteInspector(),
  makeSqliteInspectionRepository(localConfig.databasePath),
  localConfig.artifactsPath,
)
const executeScoring = makeScoreCandidateTaskExecutor(localConfig.databasePath)

const program = Effect.gen(function* () {
  const worker = loadWorkerConfiguration()
  yield* Effect.try(() => migrateLocalDatabase(localConfig.databasePath))
  const codexExecutable = yield* resolveRuntimeExecutable("codex")
  const claudeExecutable = yield* resolveRuntimeExecutable("claude")
  const opencodeExecutable = yield* resolveRuntimeExecutable("opencode")
  const runtimeExecutables = {
    ...(Option.isSome(codexExecutable) ? { codex: codexExecutable.value } : {}),
    ...(Option.isSome(claudeExecutable) ? { claude: claudeExecutable.value } : {}),
    ...(Option.isSome(opencodeExecutable) ? { opencode: opencodeExecutable.value } : {}),
  }
  const discoveryRuntime = makeSubscriptionDiscoveryRuntime(runtimeExecutables)
  const discoveryRepository = makeSqliteDiscoveryRepository(localConfig.databasePath)
  const executeDiscovery = makeDiscoveryTaskExecutor(discoveryRuntime, discoveryRepository)
  const executeReassessmentSeed = makeReassessmentSeedTaskExecutor(discoveryRepository)
  const identityRepository = makeSqliteIdentityRepository(localConfig.databasePath)
  const executeIdentity = makeIdentityTaskExecutor(identityRepository, discoveryRuntime)
  const executeAbsenceConfirmation = makeAbsenceConfirmationExecutor(
    identityRepository,
    discoveryRuntime,
  )
  const assessmentRuntimes = {
    ...(Option.isSome(codexExecutable)
      ? {
          codex: makeCodexAssessmentRuntime(
            codexExecutable.value,
            undefined,
            yield* runtimeVersion(codexExecutable.value),
          ),
        }
      : {}),
    ...(Option.isSome(claudeExecutable)
      ? {
          claude: makeClaudeAssessmentRuntime(
            claudeExecutable.value,
            undefined,
            yield* runtimeVersion(claudeExecutable.value),
          ),
        }
      : {}),
    ...(Option.isSome(opencodeExecutable)
      ? {
          opencode: makeOpencodeAssessmentRuntime(
            opencodeExecutable.value,
            undefined,
            yield* runtimeVersion(opencodeExecutable.value),
          ),
        }
      : {}),
  }
  const executeAssessment = makeAssessmentTaskExecutor(
    makeSqliteAssessmentRepository(localConfig.databasePath),
    assessmentRuntimes,
  )
  yield* Console.log(
    `Worker ready with concurrency ${worker.concurrency}; SQLite: ${localConfig.databasePath}`,
  )
  if (!process.argv.includes("--check")) {
    yield* runWorker(
      `worker-${process.pid}-${crypto.randomUUID()}`,
      worker,
      () => tryAcquireWorkspaceOperationLease(localConfig.databasePath),
      closeSharedDatabases,
    ).pipe(
      Effect.provide(
        Layer.merge(
          sqliteRunTaskRepositoryLive(localConfig.databasePath),
          stageExecutorLive({
            SeedReassessment: executeReassessmentSeed,
            DiscoverBusinesses: executeDiscovery,
            CorroborateBusiness: executeIdentity,
            InspectWebsite: executeInspection,
            ConfirmAbsentWebsite: executeAbsenceConfirmation,
            AssessWebsiteOpportunity: executeAssessment,
            ScoreCandidate: executeScoring,
          }),
        ),
      ),
    )
  }
})

await Effect.runPromise(program)

function runtimeVersion(executable: string) {
  return executeRuntimeCommand(executable, ["--version"]).pipe(
    Effect.map((result) => result.stdout.trim().slice(0, 200) || "unknown"),
    Effect.catchAll(() => Effect.succeed("unknown")),
  )
}
