import { Data, Effect } from "effect"

import type { DependencyReadiness } from "@/features/local-application"
import { startProspectingRun } from "@/features/prospecting-runs/application/prospecting-run"
import {
  prepareSearchBrief,
  type SearchBriefPreflight,
} from "@/features/prospecting-runs/application/search-brief-preflight"
import type { RuntimeModelOption, RuntimeReadiness } from "@/features/runtime-settings"

export class SearchBriefConfirmationError extends Data.TaggedError("SearchBriefConfirmationError")<{
  readonly reason: "preflight-failed" | "search-area-not-selected"
}> {}

export const confirmSearchBrief = (
  input: unknown,
  selectedSearchAreaId: string,
  requestId: string,
  dependencies: readonly DependencyReadiness[],
  runtime: RuntimeReadiness,
  modelOptions?: readonly RuntimeModelOption[],
) =>
  Effect.gen(function* () {
    const preflight = yield* prepareSearchBrief(input, dependencies, runtime, modelOptions)
    yield* requireReady(preflight)
    const searchArea = preflight.searchAreas.find(
      (candidate) => candidate.id === selectedSearchAreaId,
    )
    if (!searchArea) {
      return yield* new SearchBriefConfirmationError({ reason: "search-area-not-selected" })
    }
    return yield* startProspectingRun({ ...preflight.draft, searchArea }, requestId)
  })

function requireReady(preflight: SearchBriefPreflight) {
  return preflight.ready
    ? Effect.void
    : Effect.fail(new SearchBriefConfirmationError({ reason: "preflight-failed" }))
}
