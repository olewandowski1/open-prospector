"use client"

import { AlertCircleIcon } from "@hugeicons/core-free-icons"
import { useEffect, useState } from "react"

import { Icon } from "@/components/icon"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import type { SearchBriefDefaults } from "@/features/prospecting-runs/application/prospecting-run"
import { SearchBriefForm } from "@/features/prospecting-runs/presentation/search-brief-form"
import type {
  RuntimeId,
  RuntimeModelCatalog,
  RuntimeReadiness,
} from "@/features/runtime-settings/client"

const skeletonFieldIds = ["primary", "secondary", "tertiary"] as const

type SearchBriefBootstrap = Readonly<{
  defaults?: SearchBriefDefaults
  selectedRuntime?: RuntimeId
}>

type RuntimeOptions = Readonly<{
  runtimes: readonly RuntimeReadiness[]
  modelCatalog?: RuntimeModelCatalog
}>

export function NewRunSheet() {
  const [attempt, setAttempt] = useState(0)

  return (
    <>
      <SheetHeader className="gap-1 p-4 pr-12">
        <SheetTitle>New Prospecting Run</SheetTitle>
        <SheetDescription>
          Define the market, confirm how the location was interpreted, and verify local readiness.
        </SheetDescription>
      </SheetHeader>
      <NewRunBootstrap key={attempt} onRetry={() => setAttempt((current) => current + 1)} />
    </>
  )
}

function NewRunBootstrap({ onRetry }: { onRetry: () => void }) {
  const [bootstrap, setBootstrap] = useState<SearchBriefBootstrap>()
  const [runtimeOptions, setRuntimeOptions] = useState<RuntimeOptions>()
  const [loadError, setLoadError] = useState("")
  const [runtimeError, setRuntimeError] = useState("")

  useEffect(() => {
    let cancelled = false
    setLoadError("")
    fetch("/api/search-brief/bootstrap")
      .then(async (response) => {
        if (!response.ok) throw new Error("The New Run form could not be loaded.")
        return (await response.json()) as SearchBriefBootstrap
      })
      .then((body) => {
        if (!cancelled) setBootstrap(body)
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setLoadError(
            reason instanceof Error ? reason.message : "The New Run form could not be loaded.",
          )
        }
      })
    fetch("/api/search-brief/runtimes")
      .then(async (response) => {
        if (!response.ok) throw new Error("Subscription runtimes could not be checked.")
        return (await response.json()) as RuntimeOptions
      })
      .then((body) => {
        if (!cancelled) setRuntimeOptions(body)
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setRuntimeError(
            reason instanceof Error
              ? reason.message
              : "Subscription runtimes could not be checked.",
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loadError) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <Icon icon={AlertCircleIcon} />
          <AlertTitle>The Form Could Not Be Loaded</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Retry
        </Button>
      </div>
    )
  }
  if (!bootstrap) return <NewRunSkeleton />
  return (
    <SearchBriefForm
      defaults={bootstrap.defaults}
      readyRuntimes={runtimeOptions?.runtimes.filter((runtime) => runtime.status === "Ready") ?? []}
      modelCatalog={runtimeOptions?.modelCatalog}
      runtimeLoading={!runtimeOptions && !runtimeError}
      runtimeError={runtimeError}
      selectedRuntime={bootstrap.selectedRuntime}
    />
  )
}

function NewRunSkeleton() {
  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <div
          role="status"
          aria-busy="true"
          aria-label="Loading The Search Brief"
          className="grid gap-8 px-4 pb-6 pt-2"
        >
          <FormSkeletonSection fields={3} />
          <FormSkeletonSection />
          <FormSkeletonSection />
        </div>
      </ScrollArea>
      <SheetFooter className="border-t p-3">
        <Skeleton className="h-8 w-full rounded-lg" />
      </SheetFooter>
    </>
  )
}

function FormSkeletonSection({ fields = 2 }: { fields?: number }) {
  return (
    <section className="grid gap-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="size-4 rounded-full" />
      </div>
      <div className="grid gap-4">
        {skeletonFieldIds.slice(0, fields).map((fieldId) => (
          <div key={fieldId} className="grid gap-1">
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="size-3.5 rounded-full" />
            </div>
            <Skeleton className="h-8 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </section>
  )
}
