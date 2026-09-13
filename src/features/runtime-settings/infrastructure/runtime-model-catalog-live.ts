import { Effect } from "effect"

import type { RuntimeModelCatalog } from "@/features/runtime-settings/application/runtime-execution-configuration"
import { discoverRuntimeModelCatalog } from "@/features/runtime-settings/application/runtime-model-catalog"
import type { RuntimeProbe } from "@/features/runtime-settings/application/runtime-readiness"

const CACHE_LIFETIME_MILLISECONDS = 5 * 60_000

let cachedCatalog: Readonly<{ readAt: number; catalog: RuntimeModelCatalog }> | undefined

/** One CLI catalog read serves every page render and preflight until the cache ages out. */
export const getRuntimeModelCatalog: Effect.Effect<RuntimeModelCatalog, never, RuntimeProbe> =
  Effect.suspend(() => {
    const now = Date.now()
    if (cachedCatalog && now - cachedCatalog.readAt < CACHE_LIFETIME_MILLISECONDS) {
      return Effect.succeed(cachedCatalog.catalog)
    }
    return Effect.map(discoverRuntimeModelCatalog, (catalog) => {
      cachedCatalog = { readAt: Date.now(), catalog }
      return catalog
    })
  })

export function clearRuntimeModelCatalogCache(): void {
  cachedCatalog = undefined
}
