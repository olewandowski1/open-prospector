import { Effect, Option } from "effect"
import { revalidatePath } from "next/cache"
import { connection } from "next/server"
import { Suspense } from "react"

import { SectionHeader } from "@/components/page-layout"
import { loadLocalApplicationConfig } from "@/features/local-application/configuration"
import { defaultRuntimeExecutionConfiguration } from "@/features/runtime-settings/application/runtime-execution-configuration"
import {
  getSelectedRuntime,
  setSelectedRuntimePreference,
} from "@/features/runtime-settings/application/runtime-preference"
import {
  getAllRuntimeReadiness,
  getRuntimeReadiness,
  isRuntimeId,
} from "@/features/runtime-settings/application/runtime-readiness"
import { getRuntimeModelCatalog } from "@/features/runtime-settings/infrastructure/runtime-model-catalog-live"
import { runtimePreferenceLive } from "@/features/runtime-settings/infrastructure/runtime-preference-live"
import { RuntimeProbeLive } from "@/features/runtime-settings/infrastructure/runtime-probe-live"
import { RuntimeReadinessSkeleton } from "@/features/runtime-settings/presentation/runtime-readiness-skeleton"
import { RuntimeSettingsSection } from "@/features/runtime-settings/presentation/runtime-settings-section"

async function selectRuntime(formData: FormData): Promise<void> {
  "use server"

  const value = formData.get("runtimeId")
  if (typeof value !== "string" || !isRuntimeId(value)) return
  const [runtime, modelCatalog] = await Promise.all([
    Effect.runPromise(getRuntimeReadiness(value).pipe(Effect.provide(RuntimeProbeLive))),
    Effect.runPromise(getRuntimeModelCatalog.pipe(Effect.provide(RuntimeProbeLive))),
  ])
  if (runtime.status !== "Ready") return
  const configuration = defaultRuntimeExecutionConfiguration(value, modelCatalog[value])
  if (configuration.model === "") return

  const config = loadLocalApplicationConfig()
  await Effect.runPromise(
    setSelectedRuntimePreference({ runtimeId: value, configuration }).pipe(
      Effect.provide(runtimePreferenceLive(config.databasePath)),
    ),
  )
  revalidatePath("/settings/subscription")
}

async function RuntimeReadinessCards() {
  const config = loadLocalApplicationConfig()
  const [runtimes, selected] = await Promise.all([
    Effect.runPromise(getAllRuntimeReadiness.pipe(Effect.provide(RuntimeProbeLive))),
    Effect.runPromise(
      getSelectedRuntime.pipe(Effect.provide(runtimePreferenceLive(config.databasePath))),
    ),
  ])

  return (
    <RuntimeSettingsSection
      runtimes={runtimes}
      selectedRuntime={Option.getOrUndefined(selected)}
      selectRuntime={selectRuntime}
    />
  )
}

export default async function SubscriptionSettingsRoute() {
  await connection()

  return (
    <div className="@container mx-auto flex w-full max-w-5xl flex-col gap-8">
      <section aria-labelledby="subscription-runtimes-heading" className="flex flex-col gap-4">
        <SectionHeader
          title={<span id="subscription-runtimes-heading">Subscription Runtimes</span>}
          description="Login stays in each provider's own terminal. The application stores only which runtime you selected, never a credential."
        />

        <Suspense fallback={<RuntimeReadinessSkeleton />}>
          <RuntimeReadinessCards />
        </Suspense>
      </section>
    </div>
  )
}
