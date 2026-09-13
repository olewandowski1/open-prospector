"use client"

import {
  ArrowLeftIcon,
  BanIcon,
  MapPinIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  RefreshIcon,
} from "@hugeicons/core-free-icons"
import Link from "next/link"
import { Icon } from "@/components/icon"

import { PageHeader, SectionHeader } from "@/components/page-layout"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import type { RunControl } from "@/features/run-monitoring/application/run-repositories"
import type { RunDetail } from "@/features/run-monitoring/domain/run-progress"
import { runControlAvailability } from "@/features/run-monitoring/presentation/run-detail-presentation"
import { RunFact, RunFactList } from "@/features/run-monitoring/presentation/run-fact"
import {
  formatQualified,
  formatUpdatedAt,
  humanizeStage,
  isRunSettled,
  runStatusPresentation,
} from "@/features/run-monitoring/presentation/run-presentation"
import { RunProgressFunnel } from "@/features/run-monitoring/presentation/run-progress-funnel"
import {
  type RuntimeModelOption,
  RuntimeProviderIcon,
  runtimeExecutionLabel,
} from "@/features/runtime-settings/client"
import { RunDeleteDialog } from "@/features/workspace-administration/client"
import { cn } from "@/lib/utils"

const statusTextClass = {
  success: "text-success",
  destructive: "text-destructive",
  warning: "text-warning",
  info: "text-info",
  secondary: "text-muted-foreground",
  outline: "text-muted-foreground",
} as const

export function RunDetailHeader({
  run,
  modelOptions,
  now,
  busy,
  refreshing,
  onControl,
  onRefresh,
}: {
  run: RunDetail
  modelOptions?: readonly RuntimeModelOption[]
  now: Date
  busy: boolean
  refreshing: boolean
  onControl: (control: RunControl) => void
  onRefresh: () => void
}) {
  const { canPause, canResume, canCancel } = runControlAvailability(run)
  const target = run.searchBrief.targetCount
  const qualified = run.progress.qualifiedCandidates
  const completion = target <= 0 ? 0 : Math.min(100, Math.round((qualified / target) * 100))
  const configuration = run.searchBrief.runtimeConfiguration
  const status = runStatusPresentation(run.state, run.completionState)

  return (
    <div className="flex shrink-0 flex-col gap-8">
      <PageHeader
        eyebrow={
          <Link
            href="/runs"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
          >
            <Icon icon={ArrowLeftIcon} className="size-3.5" />
            All Runs
          </Link>
        }
        title={run.searchBrief.category}
        description={
          <span className="flex min-w-0 items-center gap-1.5">
            <Icon icon={MapPinIcon} className="size-3.5 shrink-0" />
            <span className="truncate">{run.searchBrief.searchArea.displayName}</span>
          </span>
        }
        actions={
          <>
            {canPause ? (
              <Button
                variant="warning"
                size="sm"
                onClick={() => onControl("Pause")}
                disabled={busy}
              >
                <Icon icon={PauseCircleIcon} data-icon="inline-start" /> Pause
              </Button>
            ) : null}
            {canResume ? (
              <Button
                variant="success"
                size="sm"
                onClick={() => onControl("Resume")}
                disabled={busy}
              >
                <Icon icon={PlayCircleIcon} data-icon="inline-start" /> Resume
              </Button>
            ) : null}
            {canCancel ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onControl("Cancel")}
                disabled={busy}
              >
                <Icon icon={BanIcon} data-icon="inline-start" /> Cancel
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
              <Icon icon={RefreshIcon} data-icon="inline-start" /> Refresh
            </Button>
            {isRunSettled(run.state) ? (
              <RunDeleteDialog
                runId={run.id}
                runLabel={`${run.searchBrief.category} in ${run.searchBrief.searchArea.displayName}`}
              />
            ) : null}
          </>
        }
      />

      <section aria-labelledby="run-overview-heading" className="flex flex-col gap-4">
        <SectionHeader
          title={<span id="run-overview-heading">Run Overview</span>}
          description="Current execution state and the runtime handling this prospecting run."
        />
        <RunFactList>
          <RunFact label="Status">
            <span
              className={cn("font-medium", statusTextClass[status.variant])}
              title={status.detail}
            >
              {status.label}
            </span>
          </RunFact>
          <RunFact label="Current Stage">{humanizeStage(run.currentStage)}</RunFact>
          <RunFact label="Runtime">
            <span className="inline-flex min-w-0 items-center gap-2">
              <RuntimeProviderIcon runtimeId={run.searchBrief.runtime} />
              <span className="truncate">
                {configuration
                  ? runtimeExecutionLabel(run.searchBrief.runtime, configuration, modelOptions)
                  : "Model Not Recorded"}
              </span>
            </span>
          </RunFact>
          <RunFact label="Last Updated">{formatUpdatedAt(run.updatedAt, now)}</RunFact>
          {run.requestedControl !== "None" ? (
            <RunFact label="Requested Control">{run.requestedControl}</RunFact>
          ) : null}
        </RunFactList>
      </section>

      <Separator />

      <section aria-labelledby="run-progress-heading" className="flex flex-col gap-4">
        <SectionHeader
          title={<span id="run-progress-heading">Run Progress</span>}
          description="Committed checkpoint counts from discovery through qualification."
        />
        <RunFactList>
          {/* The target leads the list and keeps its bar: it is the one count with a denominator. */}
          <div className="flex flex-col gap-2 p-4">
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span className="text-muted-foreground">Qualified Target</span>
              <span className="font-medium tabular-nums">
                {formatQualified(qualified, target, " of ")} · {completion}%
              </span>
            </div>
            <Progress value={completion} />
          </div>
          <RunProgressFunnel progress={run.progress} />
        </RunFactList>
      </section>
    </div>
  )
}
