import type Database from "better-sqlite3"
import { Effect } from "effect"
import type { StructuredBusiness } from "@/features/business-discovery"
import type {
  AbsenceContext,
  CommittedIdentity,
  IdentityRepository,
  IdentityTaskContext,
} from "@/features/business-identity/application/identity-repository"
import { IdentityPersistenceError } from "@/features/business-identity/application/identity-repository"
import {
  type IdentityEvaluation,
  routeMatchKey,
  websiteMatchKey,
} from "@/features/business-identity/domain/business-identity"
import { sharedDatabase } from "@/features/local-application"
import type { SearchBrief } from "@/features/prospecting-runs"

type DiscoveredRow = Readonly<{
  id: string
  name: string
  result_url: string
  description: string | null
  source_identifier: string
  discovered_at: number
  structured: string | null
  search_brief: string
}>

export function makeSqliteIdentityRepository(databasePath: string): IdentityRepository {
  return {
    loadContext: (runId, discoveredBusinessId) =>
      databaseEffect(databasePath, "load", (database) =>
        loadContext(database, runId, discoveredBusinessId),
      ),
    loadAbsenceContext: (runBusinessId) =>
      Effect.try({
        try: () => readAbsenceContext(sharedDatabase(databasePath), runBusinessId),
        catch: () => new IdentityPersistenceError({ operation: "load" }),
      }),
    recordAbsenceConfirmation: (input) =>
      Effect.try({
        try: () => writeAbsenceConfirmation(sharedDatabase(databasePath), input),
        catch: () => new IdentityPersistenceError({ operation: "commit" }),
      }),
    commitEvaluation: (input) =>
      databaseEffect(databasePath, "commit", (database) => commitEvaluation(database, input)),
  }
}

function databaseEffect<A>(
  databasePath: string,
  operation: IdentityPersistenceError["operation"],
  use: (database: Database.Database) => A,
) {
  return Effect.try({
    try: () => use(sharedDatabase(databasePath)),
    catch: () => new IdentityPersistenceError({ operation }),
  })
}

function loadContext(
  database: Database.Database,
  runId: string,
  discoveredBusinessId: string,
): IdentityTaskContext {
  const row = database
    .prepare(
      `select d.id, d.name, d.result_url, d.description, d.source_identifier, d.discovered_at,
       d.structured, r.search_brief
       from discovered_businesses d join prospecting_runs r on r.id = d.run_id
       where d.id = ? and d.run_id = ?`,
    )
    .get(discoveredBusinessId, runId) as DiscoveredRow | undefined
  if (!row) throw new Error("discovered business missing")
  return {
    discoveredBusinessId: row.id,
    name: row.name,
    resultUrl: row.result_url,
    ...(row.description ? { description: row.description } : {}),
    searchBrief: JSON.parse(row.search_brief) as SearchBrief,
    ...(row.structured ? { structured: JSON.parse(row.structured) as StructuredBusiness } : {}),
  }
}

function commitEvaluation(
  database: Database.Database,
  input: Parameters<IdentityRepository["commitEvaluation"]>[0],
): CommittedIdentity {
  return database.transaction(() => {
    const canonicalBusinessId = input.evaluation.canonicalFingerprint
      ? upsertCanonical(database, input.evaluation, input.searchBrief, input.committedAt)
      : undefined
    const previousAssessment = canonicalBusinessId
      ? (database
          .prepare("select last_assessed_at from canonical_businesses where id = ?")
          .pluck()
          .get(canonicalBusinessId) as number | null)
      : null
    const recentlyAssessed =
      previousAssessment !== null &&
      previousAssessment >= input.committedAt.getTime() - 30 * 24 * 60 * 60 * 1_000
    const policy = input.searchBrief.recentBusinessPolicy ?? "Skip"
    const suppressed = input.evaluation.canonicalFingerprint
      ? Boolean(
          database
            .prepare("select 1 from suppression_entries where identity_fingerprint = ?")
            .get(input.evaluation.canonicalFingerprint),
        )
      : false
    // Several discovered pages routinely corroborate to one business; without this each becomes its own candidate.
    const duplicateOf = canonicalBusinessId
      ? (database
          .prepare(
            `select id from run_businesses
             where run_id = ? and canonical_business_id = ? and discovered_business_id <> ?
             order by created_at, id limit 1`,
          )
          .pluck()
          .get(input.runId, canonicalBusinessId, input.discoveredBusinessId) as string | undefined)
      : undefined
    const status: CommittedIdentity["status"] =
      input.evaluation.status !== "Eligible"
        ? input.evaluation.status
        : suppressed
          ? "Excluded"
          : duplicateOf
            ? "DuplicateCandidate"
            : recentlyAssessed && policy === "Skip"
              ? "SkippedRecent"
              : recentlyAssessed && policy === "IncludeWithoutReassessment"
                ? "IncludedRecent"
                : "Eligible"
    const runBusinessId = upsertRunBusiness(
      database,
      input,
      canonicalBusinessId,
      status,
      duplicateOf && status === "DuplicateCandidate"
        ? "Already discovered in this run under another listing."
        : undefined,
    )
    replacePresences(database, runBusinessId, canonicalBusinessId, input.evaluation)
    if (canonicalBusinessId) {
      replaceContacts(database, runBusinessId, canonicalBusinessId, input.evaluation)
    }
    updateExclusionMetrics(database, input.runId, input.committedAt)
    recordDecisionEvent(database, input, runBusinessId, status)
    const websiteUrl = input.evaluation.presences.find(
      (presence) => presence.type === "Website" && presence.associationState === "Confirmed",
    )?.url
    return {
      runBusinessId,
      ...(canonicalBusinessId ? { canonicalBusinessId } : {}),
      status,
      ...(websiteUrl ? { websiteUrl } : {}),
      shouldInspect: status === "Eligible" && Boolean(canonicalBusinessId),
    }
  })()
}

function readAbsenceContext(database: Database.Database, runBusinessId: string): AbsenceContext {
  const row = database
    .prepare(
      `select rb.canonical_business_id, cb.name, cb.locality, pr.search_brief
       from run_businesses rb
       join canonical_businesses cb on cb.id = rb.canonical_business_id
       join prospecting_runs pr on pr.id = rb.run_id
       where rb.id = ?`,
    )
    .get(runBusinessId) as
    | { canonical_business_id: string; name: string; locality: string; search_brief: string }
    | undefined
  if (!row) throw new Error("run business missing")
  return {
    canonicalBusinessId: row.canonical_business_id,
    name: row.name,
    locality: row.locality,
    searchBrief: JSON.parse(row.search_brief) as SearchBrief,
    corroboratingSources: Number(
      database
        .prepare("select count(distinct url) from online_presences where canonical_business_id = ?")
        .pluck()
        .get(row.canonical_business_id),
    ),
  }
}

// The pages the confirming search read become presences, so the absence is corroborated by them.
function writeAbsenceConfirmation(
  database: Database.Database,
  input: {
    runBusinessId: string
    canonicalBusinessId: string
    pagesRead: readonly string[]
    websiteUrl?: string
    collectedAt: Date
  },
): void {
  const insert = database.prepare(
    `insert into online_presences
     (id, canonical_business_id, run_business_id, type, url, source_identifier,
      association_state, match_key, collected_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
     on conflict(run_business_id, url) do nothing`,
  )
  database.transaction(() => {
    for (const url of new Set(input.pagesRead)) {
      const website = url === input.websiteUrl
      insert.run(
        crypto.randomUUID(),
        input.canonicalBusinessId,
        input.runBusinessId,
        website ? "Website" : "Directory",
        url,
        "absence-confirmation",
        "Confirmed",
        (website ? websiteMatchKey(url) : undefined) ?? null,
        input.collectedAt.getTime(),
      )
    }
  })()
}

function upsertCanonical(
  database: Database.Database,
  evaluation: IdentityEvaluation,
  searchBrief: SearchBrief,
  now: Date,
): string {
  const fingerprint = evaluation.canonicalFingerprint
  if (!fingerprint) throw new Error("canonical fingerprint missing")
  const existing = database
    .prepare("select id from canonical_businesses where identity_fingerprint = ?")
    .get(fingerprint) as { id: string } | undefined
  if (existing) return existing.id
  const knownByRoute = resolveByRoute(database, evaluation)
  if (knownByRoute) return knownByRoute
  const locality = searchBrief.searchArea.displayName.split(",")[0]?.trim() ?? searchBrief.location
  const normalizedName = normalizeCanonicalName(evaluation.canonicalName)
  const id = crypto.randomUUID()
  // The first corroborated name is already shown against every candidate, so a later listing never renames it.
  database
    .prepare(
      `insert into canonical_businesses
       (id, identity_fingerprint, name, normalized_name, locality, country_code, decision_scope,
        created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(identity_fingerprint) do update set
        decision_scope = excluded.decision_scope, updated_at = excluded.updated_at`,
    )
    .run(
      id,
      fingerprint,
      evaluation.canonicalName,
      normalizedName,
      locality,
      searchBrief.searchArea.countryCode,
      evaluation.decisionScope,
      now.getTime(),
      now.getTime(),
    )
  return id
}

// A run that captured a different telephone, or none, once keyed the same garage as a new business.
function resolveByRoute(
  database: Database.Database,
  evaluation: IdentityEvaluation,
): string | undefined {
  const keys = [
    ...evaluation.contacts.map((contact) => routeMatchKey(contact)),
    ...evaluation.presences
      .filter((presence) => presence.type === "Website")
      .map((presence) => websiteMatchKey(presence.url)),
  ].filter((key): key is string => key !== undefined)
  if (keys.length === 0) return undefined
  const placeholders = keys.map(() => "?").join(",")
  return database
    .prepare(
      `select canonical_business_id from contact_routes
       where match_key in (${placeholders}) and canonical_business_id is not null
       union
       select canonical_business_id from online_presences
       where match_key in (${placeholders}) and canonical_business_id is not null
       limit 1`,
    )
    .pluck()
    .get(...keys, ...keys) as string | undefined
}

function normalizeCanonicalName(name: string): string {
  return name.toLocaleLowerCase("pl").replace(/\s+/gu, " ").trim()
}

function upsertRunBusiness(
  database: Database.Database,
  input: Parameters<IdentityRepository["commitEvaluation"]>[0],
  canonicalBusinessId: string | undefined,
  status: CommittedIdentity["status"],
  exclusionReason?: string,
): string {
  const existing = database
    .prepare("select id from run_businesses where run_id = ? and discovered_business_id = ?")
    .get(input.runId, input.discoveredBusinessId) as { id: string } | undefined
  const id = existing?.id ?? crypto.randomUUID()
  database
    .prepare(
      `insert into run_businesses
       (id, run_id, discovered_business_id, canonical_business_id, status, identity_confidence,
        exclusion_code, exclusion_reason, signals, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(run_id, discovered_business_id) do update set
        canonical_business_id = excluded.canonical_business_id, status = excluded.status,
        identity_confidence = excluded.identity_confidence, exclusion_code = excluded.exclusion_code,
        exclusion_reason = excluded.exclusion_reason, signals = excluded.signals,
        updated_at = excluded.updated_at`,
    )
    .run(
      id,
      input.runId,
      input.discoveredBusinessId,
      canonicalBusinessId ?? null,
      status,
      input.evaluation.status === "Ambiguous" ? "Ambiguous" : "Corroborated",
      input.evaluation.exclusionCode ?? (exclusionReason ? "duplicate-candidate" : null),
      exclusionReason ?? input.evaluation.exclusionReason ?? null,
      JSON.stringify(input.evaluation.signals),
      input.committedAt.getTime(),
      input.committedAt.getTime(),
    )
  return id
}

function replacePresences(
  database: Database.Database,
  runBusinessId: string,
  canonicalBusinessId: string | undefined,
  evaluation: IdentityEvaluation,
): void {
  database.prepare("delete from online_presences where run_business_id = ?").run(runBusinessId)
  const insert = database.prepare(
    `insert into online_presences
     (id, canonical_business_id, run_business_id, type, url, source_identifier,
      association_state, match_key, collected_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const seenUrls = new Set<string>()
  for (const presence of evaluation.presences) {
    if (seenUrls.has(presence.url)) continue
    seenUrls.add(presence.url)
    insert.run(
      crypto.randomUUID(),
      canonicalBusinessId ?? null,
      runBusinessId,
      presence.type,
      presence.url,
      presence.sourceIdentifier,
      presence.associationState,
      (presence.type === "Website" ? websiteMatchKey(presence.url) : undefined) ?? null,
      presence.collectedAt.getTime(),
    )
  }
}

function replaceContacts(
  database: Database.Database,
  runBusinessId: string,
  canonicalBusinessId: string,
  evaluation: IdentityEvaluation,
): void {
  database.prepare("delete from contact_routes where run_business_id = ?").run(runBusinessId)
  const insert = database.prepare(
    `insert into contact_routes
     (id, canonical_business_id, run_business_id, type, value, source_url, match_key, collected_at)
     values (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  // Reading several pages about one business reports its telephone more than once.
  const seen = new Set<string>()
  for (const contact of evaluation.contacts) {
    const key = `${contact.type}:${contact.value}`
    if (seen.has(key)) continue
    seen.add(key)
    insert.run(
      crypto.randomUUID(),
      canonicalBusinessId,
      runBusinessId,
      contact.type,
      contact.value,
      contact.sourceUrl,
      routeMatchKey(contact) ?? null,
      contact.collectedAt.getTime(),
    )
  }
}

function updateExclusionMetrics(database: Database.Database, runId: string, now: Date): void {
  const exclusions = Number(
    database
      .prepare(
        `select count(*) from run_businesses
         where run_id = ?
         and status in ('Ambiguous', 'Excluded', 'SkippedRecent', 'DuplicateCandidate')`,
      )
      .pluck()
      .get(runId),
  )
  database
    .prepare(
      `update run_metrics set exclusions = ?, updated_at = ?, version = version + 1
       where run_id = ?`,
    )
    .run(exclusions, now.getTime(), runId)
}

function recordDecisionEvent(
  database: Database.Database,
  input: Parameters<IdentityRepository["commitEvaluation"]>[0],
  runBusinessId: string,
  status: CommittedIdentity["status"],
): void {
  const confirmation = input.evaluation.signals.includes("ContactRouteConfirmed")
    ? " A confirming search found the Contact Route the report missed."
    : input.evaluation.signals.includes("ContactRouteSearchFoundNone")
      ? " A confirming search found no Contact Route."
      : ""
  database
    .prepare(
      `insert into technical_run_events
       (id, run_id, task_id, business_id, kind, source_identifier, result_url, message,
        details, schema_version, created_at)
       values (?, ?, ?, ?, 'IdentityDecision', ?, null, ?, ?, 1, ?)`,
    )
    .run(
      crypto.randomUUID(),
      input.runId,
      input.taskId,
      input.discoveredBusinessId,
      runBusinessId,
      (status === "Eligible"
        ? "Public signals corroborated a locally controlled business identity."
        : "Public signals produced a retained identity or eligibility decision.") + confirmation,
      JSON.stringify({
        status,
        signals: input.evaluation.signals,
        exclusionCode: input.evaluation.exclusionCode ?? null,
      }),
      input.committedAt.getTime(),
    )
}
