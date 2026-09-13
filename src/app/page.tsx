import { Effect, Option } from "effect"
import { connection } from "next/server"
import { Suspense } from "react"

import { AppShell } from "@/components/app-shell/app-shell"
import { loadLocalApplicationConfig } from "@/features/local-application/configuration"
import {
  OverviewPage,
  type RuntimeSteering,
  RuntimeSteeringPanel,
  RuntimeSteeringSkeleton,
} from "@/features/overview"
import { getCandidateSummary, getRecentCandidates } from "@/features/review-queue"
import { listPersistedRuns } from "@/features/run-monitoring/server/run-services"
import {
  defaultRuntimeExecutionConfiguration,
  isRuntimeExecutionConfiguration,
} from "@/features/runtime-settings/application/runtime-execution-configuration"
import {
  getSelectedRuntimePreference,
  setSelectedRuntimePreference,
} from "@/features/runtime-settings/application/runtime-preference"
import {
  getAllRuntimeReadiness,
  isRuntimeId,
} from "@/features/runtime-settings/application/runtime-readiness"
import { getRuntimeModelCatalog } from "@/features/runtime-settings/infrastructure/runtime-model-catalog-live"
import { runtimePreferenceLive } from "@/features/runtime-settings/infrastructure/runtime-preference-live"
import { RuntimeProbeLive } from "@/features/runtime-settings/infrastructure/runtime-probe-live"

// Readiness is not re-probed here: preflight already refuses a run whose runtime is not Ready.
async function saveSteering(steering: RuntimeSteering): Promise<void> {
  "use server"

  const { runtimeId, model, reasoningEffort } = steering
  if (!isRuntimeId(runtimeId)) return
  const configuration = { model, reasoningEffort }
  const modelCatalog = await Effect.runPromise(
    getRuntimeModelCatalog.pipe(Effect.provide(RuntimeProbeLive)),
  )
  if (!isRuntimeExecutionConfiguration(runtimeId, configuration, modelCatalog[runtimeId])) return

  const config = loadLocalApplicationConfig()
  await Effect.runPromise(
    setSelectedRuntimePreference({ runtimeId, configuration }).pipe(
      Effect.provide(runtimePreferenceLive(config.databasePath)),
    ),
  )
}

async function SteeringPanel() {
  const config = loadLocalApplicationConfig()
  const [runtimes, preference, modelCatalog] = await Promise.all([
    Effect.runPromise(getAllRuntimeReadiness.pipe(Effect.provide(RuntimeProbeLive))),
    Effect.runPromise(
      getSelectedRuntimePreference.pipe(Effect.provide(runtimePreferenceLive(config.databasePath))),
    ),
    Effect.runPromise(getRuntimeModelCatalog.pipe(Effect.provide(RuntimeProbeLive))),
  ])
  const selected = Option.getOrUndefined(preference)
  const steering: RuntimeSteering | undefined = selected
    ? {
        runtimeId: selected.runtimeId,
        ...(isRuntimeExecutionConfiguration(
          selected.runtimeId,
          selected.configuration,
          modelCatalog[selected.runtimeId],
        )
          ? selected.configuration
          : defaultRuntimeExecutionConfiguration(
              selected.runtimeId,
              modelCatalog[selected.runtimeId],
            )),
      }
    : undefined

  return (
    <RuntimeSteeringPanel
      runtimes={runtimes}
      modelCatalog={modelCatalog}
      steering={steering}
      saveSteering={saveSteering}
    />
  )
}

export default async function OverviewRoute() {
  await connection()
  const now = new Date()
  const runList = await listPersistedRuns(now)

  return (
    <AppShell>
      <OverviewPage
        runs={runList.overview}
        candidateSummary={getCandidateSummary(now)}
        recentCandidates={getRecentCandidates()}
        steeringPanel={
          <Suspense fallback={<RuntimeSteeringSkeleton />}>
            <SteeringPanel />
          </Suspense>
        }
      />
    </AppShell>
  )
}
