import { Effect } from "effect"
import { NextResponse } from "next/server"

import { getRuntimeModelCatalog } from "@/features/runtime-settings/infrastructure/runtime-model-catalog-live"
import { RuntimeProbeLive } from "@/features/runtime-settings/infrastructure/runtime-probe-live"

// Labels for stored runs read the same bounded catalog the run form offered.
export async function GET() {
  const modelCatalog = await Effect.runPromise(
    getRuntimeModelCatalog.pipe(Effect.provide(RuntimeProbeLive)),
  )
  return NextResponse.json({ modelCatalog })
}
