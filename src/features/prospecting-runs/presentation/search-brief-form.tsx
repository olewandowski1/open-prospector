"use client"

import { Loading03Icon, Search01Icon } from "@hugeicons/core-free-icons"
import { useEffect, useMemo, useRef, useState } from "react"

import { Icon } from "@/components/icon"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SheetFooter } from "@/components/ui/sheet"
import type { SearchBriefDefaults } from "@/features/prospecting-runs/application/prospecting-run"
import type { SearchBriefPreflight } from "@/features/prospecting-runs/application/search-brief-preflight"
import { RunPreflightSection } from "@/features/prospecting-runs/presentation/run-preflight-panel"
import {
  initialSearchBriefDraft,
  type SearchBriefDraftState,
  serializeSearchBriefDraft,
} from "@/features/prospecting-runs/presentation/search-brief-draft"
import { SearchBriefFields } from "@/features/prospecting-runs/presentation/search-brief-fields"
import {
  defaultRuntimeExecutionConfiguration,
  type RuntimeId,
  type RuntimeModelCatalog,
  type RuntimeReadiness,
  runtimeModelOptions,
} from "@/features/runtime-settings/client"

export function SearchBriefForm({
  defaults,
  readyRuntimes,
  modelCatalog,
  runtimeLoading,
  runtimeError,
  selectedRuntime,
}: {
  defaults?: SearchBriefDefaults
  readyRuntimes: readonly RuntimeReadiness[]
  modelCatalog?: RuntimeModelCatalog
  runtimeLoading: boolean
  runtimeError: string
  selectedRuntime?: RuntimeId
}) {
  const [draft, setDraft] = useState<SearchBriefDraftState>(() =>
    initialSearchBriefDraft(defaults, readyRuntimes, selectedRuntime, modelCatalog),
  )
  const [preflight, setPreflight] = useState<SearchBriefPreflight>()
  const [selectedAreaId, setSelectedAreaId] = useState("")
  const [requestId, setRequestId] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [createdRun, setCreatedRun] = useState<{ id: string; state: string }>()
  const preflightSectionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (preflight)
      preflightSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [preflight])

  const preferredRuntime = readyRuntimes.some((runtime) => runtime.runtimeId === selectedRuntime)
    ? selectedRuntime
    : readyRuntimes[0]?.runtimeId
  const effectiveDraft = useMemo<SearchBriefDraftState>(() => {
    const runtime = draft.runtime || preferredRuntime
    if (!runtime) return draft
    const options = runtimeModelOptions(runtime, modelCatalog)
    if (runtime === draft.runtime && options.some((option) => option.value === draft.model)) {
      return draft
    }
    const configuration = defaultRuntimeExecutionConfiguration(runtime, options)
    if (
      runtime === draft.runtime &&
      configuration.model === draft.model &&
      configuration.reasoningEffort === draft.reasoningEffort
    ) {
      return draft
    }
    return { ...draft, runtime, ...configuration }
  }, [draft, preferredRuntime, modelCatalog])

  const invalidate = (next: Partial<SearchBriefDraftState>) => {
    setDraft((current) => ({ ...current, ...next }))
    setPreflight(undefined)
    setSelectedAreaId("")
    setRequestId("")
    setCreatedRun(undefined)
    setError("")
  }

  const checkPreflight = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError("")
    setCreatedRun(undefined)
    try {
      const response = await fetch("/api/prospecting-runs/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serializeSearchBriefDraft(effectiveDraft)),
      })
      const body = (await response.json()) as SearchBriefPreflight & { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Preflight failed.")
      setPreflight(body)
      setSelectedAreaId(body.searchAreas.length === 1 ? (body.searchAreas[0]?.id ?? "") : "")
      setRequestId(crypto.randomUUID())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Preflight failed.")
    } finally {
      setBusy(false)
    }
  }

  const createRun = async () => {
    if (!preflight?.ready || !selectedAreaId || !requestId) return
    setBusy(true)
    setError("")
    try {
      const response = await fetch("/api/prospecting-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: serializeSearchBriefDraft(effectiveDraft),
          searchAreaId: selectedAreaId,
          requestId,
        }),
      })
      const body = (await response.json()) as { id?: string; state?: string; error?: string }
      if (!response.ok || !body.id || !body.state) {
        throw new Error(body.error ?? "The run was not created.")
      }
      setCreatedRun({ id: body.id, state: body.state })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The run was not created.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-8 px-4 pb-6 pt-2">
          <SearchBriefFields
            draft={effectiveDraft}
            readyRuntimes={readyRuntimes}
            modelCatalog={modelCatalog}
            runtimeLoading={runtimeLoading}
            runtimeError={runtimeError}
            onChange={invalidate}
            onSubmit={checkPreflight}
          />
          <div ref={preflightSectionRef} className="scroll-mt-2">
            <RunPreflightSection
              preflight={preflight}
              modelCatalog={modelCatalog}
              selectedAreaId={selectedAreaId}
              onSelectedAreaChange={setSelectedAreaId}
              error={error}
              createdRun={createdRun}
            />
          </div>
        </div>
      </ScrollArea>
      {!createdRun ? (
        <SheetFooter className="border-t p-3">
          {!preflight ? (
            <Button
              type="submit"
              form="new-run-brief"
              disabled={busy || !effectiveDraft.runtime || !effectiveDraft.model}
            >
              <Icon
                icon={busy ? Loading03Icon : Search01Icon}
                data-icon="inline-start"
                className={busy ? "animate-spin" : undefined}
              />
              {busy ? "Checking Preflight" : "Check Preflight"}
            </Button>
          ) : (
            <Button onClick={createRun} disabled={busy || !preflight.ready || !selectedAreaId}>
              <Icon
                icon={busy ? Loading03Icon : Search01Icon}
                data-icon="inline-start"
                className={busy ? "animate-spin" : undefined}
              />
              {busy ? "Creating Run" : "Confirm And Create Run"}
            </Button>
          )}
        </SheetFooter>
      ) : null}
    </>
  )
}
