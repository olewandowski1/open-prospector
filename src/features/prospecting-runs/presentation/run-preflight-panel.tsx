import {
  AlertCircleIcon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  InformationCircleIcon,
  MapPinIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import Link from "next/link"

import { Icon } from "@/components/icon"
import { SectionHeader } from "@/components/page-layout"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Field, FieldLabel } from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import type { SearchBriefPreflight } from "@/features/prospecting-runs/application/search-brief-preflight"
import {
  type RuntimeModelCatalog,
  runtimeExecutionLabel,
  runtimeModelOptions,
} from "@/features/runtime-settings/client"
import { cn } from "@/lib/utils"

// Render the complete preflight outcome as one document section inside the New Run sheet.
export function RunPreflightSection({
  preflight,
  modelCatalog,
  selectedAreaId,
  onSelectedAreaChange,
  error,
  createdRun,
}: {
  preflight?: SearchBriefPreflight
  modelCatalog?: RuntimeModelCatalog
  selectedAreaId: string
  onSelectedAreaChange: (value: string) => void
  error: string
  createdRun?: { id: string; state: string }
}) {
  return (
    <section aria-labelledby="run-preflight-heading">
      <SectionHeader
        title={<span id="run-preflight-heading">Run Preflight</span>}
        description="Nothing is persisted as a run until you confirm here."
        className="mb-5"
      />
      <div className="grid gap-5">
        {error ? (
          <Alert variant="destructive">
            <Icon icon={AlertCircleIcon} />
            <AlertTitle>Unable to continue</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {!preflight ? (
          <Alert variant="info">
            <Icon icon={InformationCircleIcon} />
            <AlertTitle>Before You Create A Run</AlertTitle>
            <AlertDescription>
              Complete the Search Brief and check preflight to interpret the area and verify
              dependencies.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <SearchAreaChoice
              preflight={preflight}
              selectedAreaId={selectedAreaId}
              onSelectedAreaChange={onSelectedAreaChange}
            />
            <DependencyReadiness preflight={preflight} />
            <WorkloadEstimate preflight={preflight} modelCatalog={modelCatalog} />
            {createdRun ? (
              <Alert>
                <Icon icon={CheckmarkCircle02Icon} />
                <AlertTitle>Pending run created</AlertTitle>
                <AlertDescription>
                  Run{" "}
                  <span className="font-medium tabular-nums" title={createdRun.id}>
                    #{createdRun.id.slice(0, 8)}
                  </span>{" "}
                  is ready for the worker.{" "}
                  <Link href={`/runs/${createdRun.id}`}>View Progress</Link>.
                </AlertDescription>
              </Alert>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}

function SearchAreaChoice({
  preflight,
  selectedAreaId,
  onSelectedAreaChange,
}: {
  preflight: SearchBriefPreflight
  selectedAreaId: string
  onSelectedAreaChange: (value: string) => void
}) {
  return (
    <section aria-labelledby="search-area-title">
      <h2 id="search-area-title" className="text-sm font-semibold">
        Interpreted Search Area
      </h2>
      {preflight.searchAreas.length === 0 ? (
        <p className="mt-2 text-sm text-destructive">No matching location was found.</p>
      ) : (
        <RadioGroup
          value={selectedAreaId}
          onValueChange={(value) => value && onSelectedAreaChange(value)}
          className="mt-3"
          aria-label="Search Area"
        >
          {preflight.searchAreas.map((area) => (
            <FieldLabel key={area.id}>
              <Field orientation="horizontal">
                <RadioGroupItem value={area.id} aria-label={area.displayName} />
                <Icon icon={MapPinIcon} />
                <span className="text-sm">{area.displayName}</span>
              </Field>
            </FieldLabel>
          ))}
        </RadioGroup>
      )}
      {preflight.searchAreas.length > 1 && !selectedAreaId ? (
        <p className="mt-2 text-xs font-medium text-destructive">
          Select the intended Search Area explicitly.
        </p>
      ) : null}
      <p className="mt-3 text-xs text-muted-foreground">
        Geocoding &copy; OpenStreetMap contributors. Public Nominatim is used only on your explicit
        request, cached locally, and limited to one request per second. Read the{" "}
        <a
          className="underline underline-offset-4"
          href="https://operations.osmfoundation.org/policies/nominatim/"
          target="_blank"
          rel="noreferrer"
        >
          usage policy
        </a>
        .
      </p>
    </section>
  )
}

function DependencyReadiness({ preflight }: { preflight: SearchBriefPreflight }) {
  return (
    <section aria-labelledby="dependency-title">
      <h2 id="dependency-title" className="text-sm font-semibold">
        Dependencies
      </h2>
      <ul className="mt-2 grid gap-2">
        {[...preflight.dependencies, preflight.runtime].map((dependency) => (
          <li
            key={"id" in dependency ? dependency.id : dependency.runtimeId}
            className="flex items-start gap-2 text-sm"
          >
            <Icon
              icon={dependency.status === "Ready" ? Tick02Icon : Cancel01Icon}
              className={cn(
                "mt-0.5 size-3.5",
                dependency.status === "Ready" ? "text-success" : "text-destructive",
              )}
            />
            <span className="flex-1">{dependency.label}</span>
            <span
              className={cn(
                "text-sm font-medium",
                dependency.status === "Ready" ? "text-success" : "text-destructive",
              )}
            >
              {dependency.status === "Ready" ? "Ready" : "Not Ready"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function WorkloadEstimate({
  preflight,
  modelCatalog,
}: {
  preflight: SearchBriefPreflight
  modelCatalog?: RuntimeModelCatalog
}) {
  return (
    <section aria-labelledby="estimate-title">
      <h2 id="estimate-title" className="flex items-center gap-2 text-sm font-semibold">
        <Icon icon={Clock01Icon} /> Workload Estimate
      </h2>
      <p className="mt-2 text-sm">
        About {preflight.estimate.discoveryQueries} discovery queries, up to{" "}
        {preflight.estimate.likelyInspections} inspections, and {preflight.estimate.duration}.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{preflight.estimate.note}</p>
      {preflight.draft.runtimeConfiguration ? (
        <p className="mt-2 text-xs font-medium">
          {preflight.runtime.label}:{" "}
          {runtimeExecutionLabel(
            preflight.draft.runtime,
            preflight.draft.runtimeConfiguration,
            runtimeModelOptions(preflight.draft.runtime, modelCatalog),
          )}
        </p>
      ) : null}
    </section>
  )
}
