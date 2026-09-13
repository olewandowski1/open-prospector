import { Effect } from "effect"
import { NextResponse } from "next/server"

import { getAllRuntimeReadiness } from "@/features/runtime-settings/application/runtime-readiness"
import { getRuntimeModelCatalog } from "@/features/runtime-settings/infrastructure/runtime-model-catalog-live"
import { RuntimeProbeLive } from "@/features/runtime-settings/infrastructure/runtime-probe-live"

// Kept separate from brief defaults because each runtime invokes bounded CLI readiness checks.
export async function GET() {
  const [runtimes, modelCatalog] = await Promise.all([
    Effect.runPromise(getAllRuntimeReadiness.pipe(Effect.provide(RuntimeProbeLive))),
    Effect.runPromise(getRuntimeModelCatalog.pipe(Effect.provide(RuntimeProbeLive))),
  ])
  return NextResponse.json({ runtimes, modelCatalog })
}
