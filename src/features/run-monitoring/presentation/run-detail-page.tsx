"use client"

import { AlertCircleIcon, Loading03Icon } from "@hugeicons/core-free-icons"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useState } from "react"
import { Icon } from "@/components/icon"

import { PageScroller } from "@/components/page-scroller"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { RunControl } from "@/features/run-monitoring/application/run-repositories"
import type { RunDetail } from "@/features/run-monitoring/domain/run-progress"
import { RunBusinessesTable } from "@/features/run-monitoring/presentation/run-businesses-table"
import { RunDetailHeader } from "@/features/run-monitoring/presentation/run-detail-header"
import { isRunTerminal } from "@/features/run-monitoring/presentation/run-detail-presentation"
import { TechnicalLogSheet } from "@/features/run-monitoring/presentation/technical-log-panel"
import { type RuntimeModelCatalog, runtimeModelOptions } from "@/features/runtime-settings/client"

export function RunDetailPage({ runId, initialRun }: { runId: string; initialRun?: RunDetail }) {
  const queryClient = useQueryClient()
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>()
  const query = useQuery({
    queryKey: ["run", runId],
    queryFn: () => fetchRun(runId),
    ...(initialRun ? { initialData: initialRun } : {}),
    refetchInterval: (state) => (isRunTerminal(state.state.data) ? false : 1_500),
  })
  const modelCatalog = useQuery({
    queryKey: ["runtime-model-catalog"],
    queryFn: fetchModelCatalog,
    staleTime: Number.POSITIVE_INFINITY,
  })
  const control = useMutation({
    mutationFn: (value: RunControl) => controlRun(runId, value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["run", runId] }),
  })

  if (!query.data) {
    return (
      <PageScroller className="flex items-center justify-center p-8">
        {query.isError ? (
          <Alert variant="destructive">
            <Icon icon={AlertCircleIcon} />
            <AlertTitle>Run Unavailable</AlertTitle>
            <AlertDescription>
              The persisted run could not be loaded. <Link href="/runs">Return to Runs</Link>.
            </AlertDescription>
          </Alert>
        ) : (
          <Icon icon={Loading03Icon} className="animate-spin" aria-label="Loading run" />
        )}
      </PageScroller>
    )
  }

  const run = query.data
  const selectedBusiness = run.businesses.find((business) => business.id === selectedBusinessId)

  return (
    <PageScroller className="flex flex-col gap-6">
      {/* A failed refresh keeps the last committed snapshot on screen and says it is stale. */}
      {query.isError ? (
        <Alert variant="destructive">
          <Icon icon={AlertCircleIcon} />
          <AlertTitle>Progress Not Refreshing</AlertTitle>
          <AlertDescription>
            These figures are the last that could be read. <Link href="/runs">Return to Runs</Link>.
          </AlertDescription>
        </Alert>
      ) : null}

      <RunDetailHeader
        run={run}
        modelOptions={runtimeModelOptions(run.searchBrief.runtime, modelCatalog.data)}
        now={new Date()}
        busy={control.isPending}
        refreshing={query.isFetching}
        onControl={(value) => control.mutate(value)}
        onRefresh={() => query.refetch()}
      />

      {control.isError ? (
        <Alert variant="destructive">
          <Icon icon={AlertCircleIcon} />
          <AlertTitle>Control Not Accepted</AlertTitle>
          <AlertDescription>The persisted state changed; refresh and try again.</AlertDescription>
        </Alert>
      ) : null}

      <RunBusinessesTable
        businesses={run.businesses}
        selectedBusinessId={selectedBusinessId}
        onSelect={setSelectedBusinessId}
        action={
          <TechnicalLogSheet
            events={run.technicalLog}
            limit={run.technicalLogLimit}
            truncated={run.technicalLogTruncated}
            businessId={selectedBusinessId}
            businessLabel={selectedBusiness?.name ?? selectedBusiness?.id}
            onClearBusiness={() => setSelectedBusinessId(undefined)}
          />
        }
      />
    </PageScroller>
  )
}

async function fetchRun(runId: string): Promise<RunDetail> {
  const response = await fetch(`/api/runs/${encodeURIComponent(runId)}`)
  if (!response.ok) throw new Error("run unavailable")
  return (await response.json()) as RunDetail
}

async function fetchModelCatalog(): Promise<RuntimeModelCatalog | undefined> {
  const response = await fetch("/api/runtimes/models")
  if (!response.ok) return undefined
  const body = (await response.json()) as { modelCatalog?: RuntimeModelCatalog }
  return body.modelCatalog
}

async function controlRun(runId: string, control: RunControl): Promise<void> {
  const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ control }),
  })
  if (!response.ok) throw new Error("control rejected")
}
