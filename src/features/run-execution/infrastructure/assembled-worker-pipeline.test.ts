import { dirname, join } from "node:path"

import Database from "better-sqlite3"
import { Effect, Layer } from "effect"
import { afterEach, describe, expect, it } from "vitest"

import {
  type DiscoveryRuntime,
  DiscoveryRuntimeError,
  makeDiscoveryTaskExecutor,
  makeReassessmentSeedTaskExecutor,
  makeSqliteDiscoveryRepository,
} from "@/features/business-discovery"
import {
  makeAbsenceConfirmationExecutor,
  makeIdentityTaskExecutor,
  makeSqliteIdentityRepository,
} from "@/features/business-identity"
import { closeSharedDatabases } from "@/features/local-application"
import {
  assessmentReplayFixtures,
  discoveryReplayFixtures,
  FIXTURE_OBSERVED_AT,
} from "@/features/mvp-evaluation"
import { makeScoreCandidateTaskExecutor } from "@/features/review-queue"
import {
  runWorkerCycle,
  sqliteRunTaskRepositoryLive,
  stageExecutorLive,
} from "@/features/run-execution"
import { controlRun, sqliteRunMonitoringLive } from "@/features/run-monitoring"
import type {
  AssessmentEvidenceEnvelope,
  AssessmentOutput,
  AssessmentRuntime,
} from "@/features/website-assessment"
import {
  makeAssessmentTaskExecutor,
  makeSqliteAssessmentRepository,
} from "@/features/website-assessment"
import type { WebsiteInspectionResult, WebsiteInspector } from "@/features/website-inspection"
import {
  makeInspectionTaskExecutor,
  makeSqliteInspectionRepository,
  WebsiteInspectorError,
} from "@/features/website-inspection"
import { createMigratedTestDatabase } from "@/test-support/local-database"
import { createTestProspectingRun } from "@/test-support/prospecting-run"

const databases: ReturnType<typeof createMigratedTestDatabase>[] = []

afterEach(() => {
  closeSharedDatabases()
  for (const database of databases.splice(0)) database.cleanup()
})

describe("assembled worker pipeline", () => {
  it("drives a confirmed Search Brief through every durable stage offline", async () => {
    const database = fixtureDatabase()
    const run = await createTestProspectingRun(database.path, "assembled-happy")
    const layer = assembledWorkerLayer(database.path)

    await driveUntilSettled(database.path, layer)
    closeSharedDatabases()

    const checked = new Database(database.path, { readonly: true })
    try {
      expect(stageCounts(checked, run.id)).toEqual({
        RunPlanning: 1,
        DiscoverBusinesses: 1,
        CorroborateBusiness: 9,
        InspectWebsite: 4,
        // One business reported no website, and one search confirmed it.
        ConfirmAbsentWebsite: 1,
        AssessWebsiteOpportunity: 4,
        ScoreCandidate: 4,
      })
      expect(
        checked
          .prepare("select count(*) from run_tasks where run_id=? and status!='Completed'")
          .pluck()
          .get(run.id),
      ).toBe(0)
      assertPayloadHandoffs(checked, run.id)
      expect(
        checked.prepare("select count(*) from candidate_scores where qualified=1").pluck().get(),
      ).toBe(4)
      const candidate = checked
        .prepare(
          `select cs.severity_component,cs.observed_defect_component,cs.contact_component,
           cs.local_decision_component,cs.commercial_value_component,cs.total,cs.qualified,
           so.source_url,so.observed_at,ip.captured_at
           from candidate_scores cs
           join website_opportunities wo on wo.assessment_id=cs.assessment_id
           join supporting_observations so on so.opportunity_id=wo.id
           join inspection_pages ip on ip.final_url=so.source_url
           order by cs.id limit 1`,
        )
        .get() as Record<string, unknown>
      expect(candidate).toMatchObject({
        severity_component: 44,
        observed_defect_component: 4,
        contact_component: 15,
        local_decision_component: 10,
        commercial_value_component: 7,
        total: 80,
        qualified: 1,
      })
      expect(candidate.observed_at).toBe(candidate.captured_at)
      expect(String(candidate.source_url)).toMatch(/\.fixture\.test\/$/u)
      expect(
        checked
          .prepare("select state,completion_state from prospecting_runs where id=?")
          .get(run.id),
      ).toEqual({ state: "Completed", completion_state: "Search Exhausted" })
    } finally {
      checked.close()
    }
  })

  it("resumes after rebuilding composition without repeating committed stages", async () => {
    const database = fixtureDatabase()
    const run = await createTestProspectingRun(database.path, "assembled-restart")

    const firstClaimed = await Effect.runPromise(
      runWorkerCycle("fixture-worker", workerConfiguration).pipe(
        Effect.provide(assembledWorkerLayer(database.path, { blockDiscovery: true })),
      ),
    )
    expect(firstClaimed).toBe(2)
    closeSharedDatabases()

    await Effect.runPromise(
      controlRun(run.id, "Resume").pipe(Effect.provide(sqliteRunMonitoringLive(database.path))),
    )
    closeSharedDatabases()
    await driveUntilSettled(database.path, assembledWorkerLayer(database.path))
    closeSharedDatabases()

    const checked = new Database(database.path, { readonly: true })
    try {
      expect(
        checked
          .prepare("select count(*) from run_tasks where run_id=? and stage='RunPlanning'")
          .pluck()
          .get(run.id),
      ).toBe(1)
      expect(
        checked
          .prepare("select count(*) from discovery_reports where run_id=?")
          .pluck()
          .get(run.id),
      ).toBe(1)
      expect(
        checked
          .prepare("select count(*) from discovered_businesses where run_id=?")
          .pluck()
          .get(run.id),
      ).toBe(9)
      expect(
        checked
          .prepare("select count(*) from website_inspections where run_id=?")
          .pluck()
          .get(run.id),
      ).toBe(4)
      expect(
        checked.prepare("select state from prospecting_runs where id=?").pluck().get(run.id),
      ).toBe("Completed")
    } finally {
      checked.close()
    }
  })

  it("isolates one repeated inspection failure and completes successful businesses", async () => {
    const database = fixtureDatabase()
    const run = await createTestProspectingRun(database.path, "assembled-partial")

    await driveUntilSettled(
      database.path,
      assembledWorkerLayer(database.path, { failInspectionFor: "workshop-alpha.fixture.test" }),
    )
    closeSharedDatabases()

    const checked = new Database(database.path, { readonly: true })
    try {
      expect(
        checked
          .prepare(
            `select count(*) from run_tasks t join discovered_businesses d on d.id=t.business_id
             where t.run_id=? and t.stage='InspectWebsite' and t.status='FailedPermanent'
             and d.name='Fixture Local Workshop Alpha'`,
          )
          .pluck()
          .get(run.id),
      ).toBe(1)
      expect(
        checked.prepare("select count(*) from candidate_scores where run_id=?").pluck().get(run.id),
      ).toBe(3)
      expect(
        checked
          .prepare("select state,completion_state from prospecting_runs where id=?")
          .get(run.id),
      ).toEqual({ state: "Completed", completion_state: "Completed with Warnings" })
    } finally {
      checked.close()
    }
  })
})

const workerConfiguration = {
  concurrency: 1,
  leaseMilliseconds: 30_000,
  pollMilliseconds: 1,
} as const

function fixtureDatabase() {
  const database = createMigratedTestDatabase()
  databases.push(database)
  return database
}

function assembledWorkerLayer(
  databasePath: string,
  options: Readonly<{ blockDiscovery?: boolean; failInspectionFor?: string }> = {},
) {
  const artifactsPath = join(dirname(databasePath), "artifacts")
  const discoveryRepository = makeSqliteDiscoveryRepository(databasePath)
  const executeDiscovery = makeDiscoveryTaskExecutor(
    discoveryRuntime(Boolean(options.blockDiscovery)),
    discoveryRepository,
  )
  const identityRepository = makeSqliteIdentityRepository(databasePath)
  const executeIdentity = makeIdentityTaskExecutor(
    identityRepository,
    discoveryRuntime(Boolean(options.blockDiscovery)),
  )
  const executeAbsenceConfirmation = makeAbsenceConfirmationExecutor(
    identityRepository,
    discoveryRuntime(Boolean(options.blockDiscovery)),
  )
  const executeInspection = makeInspectionTaskExecutor(
    websiteInspector(options.failInspectionFor),
    makeSqliteInspectionRepository(databasePath),
    artifactsPath,
  )
  const executeAssessment = makeAssessmentTaskExecutor(
    makeSqliteAssessmentRepository(databasePath),
    { codex: assessmentRuntime() },
  )
  return Layer.merge(
    sqliteRunTaskRepositoryLive(databasePath),
    stageExecutorLive({
      SeedReassessment: makeReassessmentSeedTaskExecutor(discoveryRepository),
      DiscoverBusinesses: executeDiscovery,
      CorroborateBusiness: executeIdentity,
      InspectWebsite: executeInspection,
      ConfirmAbsentWebsite: executeAbsenceConfirmation,
      AssessWebsiteOpportunity: executeAssessment,
      ScoreCandidate: makeScoreCandidateTaskExecutor(databasePath),
    }),
  )
}

type AssembledWorkerLayer = ReturnType<typeof assembledWorkerLayer>

async function driveUntilSettled(
  databasePath: string,
  layer: AssembledWorkerLayer,
  maximumCycles = 12,
): Promise<void> {
  for (let cycle = 0; cycle < maximumCycles; cycle += 1) {
    await Effect.runPromise(
      runWorkerCycle(`fixture-worker-${cycle}`, workerConfiguration).pipe(Effect.provide(layer)),
    )
    closeSharedDatabases()
    const database = new Database(databasePath)
    try {
      const active = Number(
        database
          .prepare("select count(*) from run_tasks where status in ('Pending','Leased')")
          .pluck()
          .get(),
      )
      if (active === 0) return
      database.prepare("update run_tasks set available_at=0 where status='Pending'").run()
    } finally {
      database.close()
    }
  }
  throw new Error(`Assembled worker pipeline exceeded ${maximumCycles} cycles.`)
}

function discoveryRuntime(blocked: boolean): DiscoveryRuntime {
  const fixture = discoveryReplayFixtures[0]
  if (!fixture) throw new Error("Expected discovery replay fixture")
  return {
    identifier: "fixture-discovery-runtime",
    report: () =>
      blocked
        ? Effect.fail(
            new DiscoveryRuntimeError({
              classification: "Blocked",
              code: "fixture-runtime-unavailable",
              message: "The deterministic fixture runtime is unavailable.",
            }),
          )
        : Effect.succeed(fixture.report),
    structure: () => Effect.succeed(fixture.structuredOutput),
  }
}

function websiteInspector(failFor?: string): WebsiteInspector {
  return {
    inspect: (input) => {
      if (failFor && input.url.includes(failFor)) {
        return Effect.fail(
          new WebsiteInspectorError({
            classification: "Infrastructure",
            code: "fixture-browser-crashed",
            message: "The deterministic fixture browser stopped.",
          }),
        )
      }
      return Effect.succeed(inspectionResult(input.url, input.artifactDirectory))
    },
  }
}

function inspectionResult(url: string, artifactDirectory: string): WebsiteInspectionResult {
  const capturedAt = new Date(FIXTURE_OBSERVED_AT)
  return {
    status: "Complete",
    pages: [
      {
        sequence: 0,
        viewport: "Desktop",
        requestedUrl: url,
        finalUrl: url,
        title: "Fixture Page",
        renderedText: "Invented page evidence for the assembled offline pipeline.",
        links: [],
        forms: [],
        consoleFailures: [],
        networkFailures: [],
        measurements: {
          domNodes: 1,
          headings: 1,
          links: 0,
          forms: 0,
          images: 0,
          imagesMissingAlt: 0,
          // The funnel is driven all the way to Candidates, so the page carries a measured defect.
          unlabeledControls: 8,
          horizontalOverflow: false,
          usesHttps: true,
        },
        capturedAt,
        screenshotPath: join(artifactDirectory, "fixture.png"),
        screenshotBytes: 1,
        screenshotSha256: "fixture-sha256",
      },
    ],
    blocks: [],
    startedAt: capturedAt,
    completedAt: capturedAt,
    configurationVersion: "quick-v1",
  }
}

function assessmentRuntime(): AssessmentRuntime {
  return {
    id: "codex",
    version: "fixture-runtime-v1",
    assess: (evidence) => Effect.sync(() => assessmentOutput(evidence)),
  }
}

function assessmentOutput(evidence: AssessmentEvidenceEnvelope): AssessmentOutput {
  const fixture = assessmentReplayFixtures.find(
    (candidate) => candidate.id === "class-WeakDiscoverability",
  )
  const opportunity = fixture?.runtimeOutput.opportunities[0]
  const observation = opportunity?.observations[0]
  const citation =
    evidence.pages[0] ?? evidence.publicPresenceSources[0] ?? evidence.inspectionBlocks[0]
  if (!fixture || !opportunity || !observation || !citation || !("sourceUrl" in citation)) {
    throw new Error("Expected assessment replay evidence")
  }
  return {
    ...fixture.runtimeOutput,
    opportunities: [
      {
        ...opportunity,
        observations: [
          {
            ...observation,
            sourceUrl: citation.sourceUrl,
            observedAt: citation.observedAt,
          },
        ],
      },
    ],
  }
}

function stageCounts(database: Database.Database, runId: string): Record<string, number> {
  return Object.fromEntries(
    (
      database
        .prepare("select stage,count(*) count from run_tasks where run_id=? group by stage")
        .all(runId) as Array<{ stage: string; count: number }>
    ).map((row) => [row.stage, row.count]),
  )
}

function assertPayloadHandoffs(database: Database.Database, runId: string): void {
  const rows = database
    .prepare("select stage,business_id,input from run_tasks where run_id=?")
    .all(runId) as Array<{ stage: string; business_id: string | null; input: string }>
  for (const row of rows) {
    const input = JSON.parse(row.input) as Record<string, unknown>
    if (row.stage === "CorroborateBusiness") {
      expect(input.businessId).toBe(row.business_id)
    }
    if (row.stage === "InspectWebsite") {
      const association = database
        .prepare(
          "select id,canonical_business_id from run_businesses where discovered_business_id=?",
        )
        .get(row.business_id) as { id: string; canonical_business_id: string }
      expect(input).toMatchObject({
        runBusinessId: association.id,
        canonicalBusinessId: association.canonical_business_id,
      })
    }
    if (row.stage === "AssessWebsiteOpportunity") {
      expect(
        database
          .prepare("select 1 from website_inspections where id=?")
          .pluck()
          .get(input.inspectionId),
      ).toBe(1)
      expect(typeof input.runBusinessId).toBe("string")
      expect(typeof input.canonicalBusinessId).toBe("string")
    }
    if (row.stage === "ScoreCandidate") {
      expect(
        database
          .prepare("select 1 from website_assessments where id=?")
          .pluck()
          .get(input.assessmentId),
      ).toBe(1)
      expect(typeof input.runBusinessId).toBe("string")
      expect(typeof input.canonicalBusinessId).toBe("string")
    }
  }
}
