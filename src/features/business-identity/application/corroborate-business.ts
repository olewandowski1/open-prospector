import { Effect } from "effect"

import {
  type DiscoveryBrief,
  type DiscoveryRuntime,
  decodeDiscoveryStructure,
  normalizeDiscoveryUrl,
  type StructuredBusiness,
  verifyAgainstReport,
} from "@/features/business-discovery"
import type {
  IdentityRepository,
  IdentityTaskContext,
} from "@/features/business-identity/application/identity-repository"
import {
  evaluateBusinessIdentity,
  normalizeWords,
} from "@/features/business-identity/domain/business-identity"
import { type RunTask, type TaskCheckpoint, TaskExecutionError } from "@/features/run-execution"

type ContactConfirmation = Readonly<{
  business: StructuredBusiness
  searchPerformed: boolean
  found: boolean
}>

export function makeIdentityTaskExecutor(
  repository: IdentityRepository,
  runtime: DiscoveryRuntime,
) {
  return (task: RunTask): Effect.Effect<TaskCheckpoint, TaskExecutionError> =>
    Effect.gen(function* () {
      const discoveredBusinessId = task.businessId ?? readBusinessId(task.input)
      if (!discoveredBusinessId) {
        return yield* permanent(
          "missing-discovered-business",
          "The identity task has no discovered business reference.",
        )
      }
      const context = yield* repository
        .loadContext(task.runId, discoveredBusinessId)
        .pipe(Effect.mapError(persistenceError))
      if (!context.structured) {
        // A missing report section identifies a row from before structured discovery.
        return yield* permanent(
          "missing-structured-business",
          "This business was discovered before structured attribution and cannot be corroborated.",
        )
      }

      const confirmation = yield* confirmContactRoutes(context, context.structured, runtime)
      const evaluation = evaluateBusinessIdentity({
        business: confirmation.business,
        countryCode: context.searchBrief.searchArea.countryCode,
        collectedAt: new Date(),
      })
      const signals = [
        ...evaluation.signals,
        ...(confirmation.searchPerformed
          ? [confirmation.found ? "ContactRouteConfirmed" : "ContactRouteSearchFoundNone"]
          : []),
      ]
      const committed = yield* repository
        .commitEvaluation({
          runId: task.runId,
          taskId: task.id,
          discoveredBusinessId,
          searchBrief: context.searchBrief,
          evaluation: { ...evaluation, signals },
          committedAt: new Date(),
        })
        .pipe(Effect.mapError(persistenceError))

      return {
        value: {
          runBusinessId: committed.runBusinessId,
          ...(committed.canonicalBusinessId
            ? { canonicalBusinessId: committed.canonicalBusinessId }
            : {}),
          status: committed.status,
          identitySignals: signals,
          onlinePresences: evaluation.presences.length,
          contactRoutes: evaluation.contacts.length,
          schemaVersion: 1,
        },
        ...(committed.shouldInspect
          ? {
              nextTasks: [
                {
                  stage: "InspectWebsite",
                  businessId: discoveredBusinessId,
                  input: {
                    runBusinessId: committed.runBusinessId,
                    canonicalBusinessId: committed.canonicalBusinessId,
                    ...(committed.websiteUrl ? { websiteUrl: committed.websiteUrl } : {}),
                  },
                  schemaVersion: 1,
                },
              ],
            }
          : {}),
      }
    })
}

// A Contact Route gates eligibility, and one was lost to a single page that hid its number.
function confirmContactRoutes(
  context: IdentityTaskContext,
  structured: StructuredBusiness,
  runtime: DiscoveryRuntime,
): Effect.Effect<ContactConfirmation, TaskExecutionError> {
  const skip: ContactConfirmation = { business: structured, searchPerformed: false, found: false }
  if (structured.contacts.length > 0) return Effect.succeed(skip)
  if (structured.centrallyControlled || structured.onlineOnly) return Effect.succeed(skip)
  if (structured.decisionScope !== "Local") return Effect.succeed(skip)

  const brief: DiscoveryBrief = {
    runtime: context.searchBrief.runtime,
    ...(context.searchBrief.runtimeConfiguration
      ? { runtimeConfiguration: context.searchBrief.runtimeConfiguration }
      : {}),
    query: `${structured.name} ${structured.locality} kontakt`.trim(),
    category: context.searchBrief.category,
    searchAreaName: context.searchBrief.searchArea.displayName,
    countryCode: context.searchBrief.searchArea.countryCode,
    searchLanguage: context.searchBrief.searchArea.countryCode === "PL" ? "pl" : "en",
    wanted: 1,
  }

  return Effect.gen(function* () {
    const report = yield* runtime.report(brief).pipe(Effect.mapError(runtimeError))
    const structure = yield* runtime.structure(brief, report).pipe(Effect.mapError(runtimeError))
    const decoded = yield* decodeDiscoveryStructure(structure).pipe(
      Effect.mapError(() => runtimeFailure("unreadable-contact-confirmation")),
    )
    const verified = verifyAgainstReport(
      decoded,
      report,
      context.searchBrief.searchArea.countryCode,
      (value: string) => normalizeDiscoveryUrl(value) !== undefined,
    )
    // The search answers about a market, so the first entry could be a neighbour's number.
    const wanted = normalizeWords(structured.name)
    const found = verified.businesses.find((business) => normalizeWords(business.name) === wanted)
    if (!found) return { business: structured, searchPerformed: true, found: false }
    return {
      business: withConfirmedRoutes(structured, found),
      searchPerformed: true,
      found: found.contacts.length > 0,
    }
  })
}

function withConfirmedRoutes(
  structured: StructuredBusiness,
  confirmed: StructuredBusiness,
): StructuredBusiness {
  const contacts = new Map(
    [...structured.contacts, ...confirmed.contacts].map((contact) => [
      `${contact.type}:${contact.value}`,
      contact,
    ]),
  )
  const presences = new Map(
    [...structured.presences, ...confirmed.presences].map((presence) => [presence.url, presence]),
  )
  const websiteUrl = structured.websiteUrl ?? confirmed.websiteUrl
  return {
    ...structured,
    sourceUrls: [...new Set([...structured.sourceUrls, ...confirmed.sourceUrls])],
    presences: [...presences.values()],
    contacts: [...contacts.values()],
    ...(websiteUrl ? { websiteUrl } : {}),
  }
}

function readBusinessId(input: Readonly<Record<string, unknown>>): string | undefined {
  const value = input.businessId
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function permanent(code: string, message: string) {
  return new TaskExecutionError({ classification: "Permanent", code, message })
}

function runtimeFailure(code: string) {
  return new TaskExecutionError({
    classification: "Transient",
    code,
    message: "The confirming search could not be read.",
  })
}

function runtimeError(error: { classification: string; code: string; message: string }) {
  return new TaskExecutionError({
    classification: error.classification === "Permanent" ? "Permanent" : "Transient",
    code: error.code,
    message: error.message,
  })
}

function persistenceError() {
  return new TaskExecutionError({
    classification: "Infrastructure",
    code: "identity-persistence-failed",
    message: "The corroborated identity could not be persisted safely.",
  })
}
