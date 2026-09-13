"use client"

import { AlertCircleIcon } from "@hugeicons/core-free-icons"
import Link from "next/link"
import { useMemo } from "react"

import { Icon } from "@/components/icon"
import { InfoButton } from "@/components/info-button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import type { SearchBriefDraftState } from "@/features/prospecting-runs/presentation/search-brief-draft"
import {
  defaultRuntimeExecutionConfiguration,
  groupRuntimeModelOptions,
  type RuntimeId,
  type RuntimeModelCatalog,
  type RuntimeModelOption,
  RuntimeProviderIcon,
  type RuntimeReadiness,
  type RuntimeReasoningEffort,
  reasoningEffortLabel,
  resolveRuntimeConfiguration,
  runtimeModelOptions,
  runtimeReasoningEfforts,
} from "@/features/runtime-settings/client"

export function SearchBriefRuntimeFields({
  draft,
  readyRuntimes,
  modelCatalog,
  loading,
  error,
  onChange,
}: {
  draft: SearchBriefDraftState
  readyRuntimes: readonly RuntimeReadiness[]
  modelCatalog?: RuntimeModelCatalog
  loading: boolean
  error: string
  onChange: (next: Partial<SearchBriefDraftState>) => void
}) {
  const runtimeItems = useMemo(
    () => readyRuntimes.map((runtime) => ({ label: runtime.label, value: runtime.runtimeId })),
    [readyRuntimes],
  )
  const modelOptions = draft.runtime ? runtimeModelOptions(draft.runtime, modelCatalog) : []
  const selectedEfforts = draft.runtime
    ? runtimeReasoningEfforts(draft.runtime, draft.model, modelOptions)
    : []

  return (
    <>
      <RuntimeSectionHeading />
      {loading ? (
        <RuntimeFieldsSkeleton />
      ) : (
        <>
          {error ? (
            <Alert variant="destructive">
              <Icon icon={AlertCircleIcon} />
              <AlertTitle>Runtime Check Failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {!error && readyRuntimes.length === 0 ? (
            <Alert variant="destructive">
              <Icon icon={AlertCircleIcon} />
              <AlertTitle>No Subscription Runtime Is Ready</AlertTitle>
              <AlertDescription>
                <Link href="/settings/subscription">Open Settings</Link> and follow the terminal
                instructions before creating a run.
              </AlertDescription>
            </Alert>
          ) : null}
          <RuntimeProviderField
            draft={draft}
            readyRuntimes={readyRuntimes}
            modelCatalog={modelCatalog}
            runtimeItems={runtimeItems}
            onChange={onChange}
          />
          {draft.runtime ? (
            <RuntimeConfigurationFields
              draft={draft}
              modelOptions={modelOptions}
              selectedEfforts={selectedEfforts}
              onChange={onChange}
            />
          ) : null}
        </>
      )}
    </>
  )
}

function RuntimeSectionHeading() {
  return (
    <div className="flex items-center gap-1.5">
      <h2 className="font-heading text-lg font-semibold tracking-tight">Subscription Runtime</h2>
      <InfoButton description="Use a ready local subscription and choose how much reasoning to apply." />
    </div>
  )
}

function RuntimeProviderField({
  draft,
  readyRuntimes,
  modelCatalog,
  runtimeItems,
  onChange,
}: {
  draft: SearchBriefDraftState
  readyRuntimes: readonly RuntimeReadiness[]
  modelCatalog?: RuntimeModelCatalog
  runtimeItems: readonly Readonly<{ label: string; value: RuntimeId }>[]
  onChange: (next: Partial<SearchBriefDraftState>) => void
}) {
  return (
    <Field>
      <FieldLabel htmlFor="runtime">Provider</FieldLabel>
      <Select
        items={runtimeItems}
        value={draft.runtime}
        onValueChange={(value) =>
          value &&
          onChange({
            runtime: value as RuntimeId,
            ...defaultRuntimeExecutionConfiguration(
              value as RuntimeId,
              modelCatalog?.[value as RuntimeId],
            ),
          })
        }
      >
        <SelectTrigger
          id="runtime"
          aria-label="Subscription Runtime"
          className="w-full"
          disabled={!runtimeItems.length}
        >
          <SelectValue placeholder="No Ready Runtime">
            {(value: string | null) => {
              const runtime = readyRuntimes.find((item) => item.runtimeId === value)
              if (!runtime) return "No Ready Runtime"
              return (
                <>
                  <RuntimeProviderIcon runtimeId={runtime.runtimeId} />
                  {runtime.label}
                </>
              )
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {readyRuntimes.map((runtime) => (
              <SelectItem key={runtime.runtimeId} value={runtime.runtimeId}>
                <RuntimeProviderIcon runtimeId={runtime.runtimeId} />
                {runtime.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )
}

function RuntimeConfigurationFields({
  draft,
  modelOptions,
  selectedEfforts,
  onChange,
}: {
  draft: SearchBriefDraftState
  modelOptions: readonly RuntimeModelOption[]
  selectedEfforts: readonly RuntimeReasoningEffort[]
  onChange: (next: Partial<SearchBriefDraftState>) => void
}) {
  if (!draft.runtime) return null
  const runtime = draft.runtime
  const models = modelOptions
  const selected = models.find((model) => model.value === draft.model)
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field>
        <RuntimeFieldHeading
          htmlFor="runtime-model"
          label="Model"
          description={
            selected?.detail ??
            (models.length === 0
              ? "The installed CLI reported no models."
              : "The selected model ID is pinned for this run.")
          }
        />
        <Select
          items={models.map((model) => ({ label: model.label, value: model.value }))}
          value={draft.model}
          onValueChange={(value) =>
            value &&
            onChange(resolveRuntimeConfiguration(runtime, value, draft.reasoningEffort, models))
          }
        >
          <SelectTrigger
            id="runtime-model"
            aria-label="Model"
            className="w-full"
            disabled={models.length === 0}
          >
            <SelectValue>
              {(value: string | null) => {
                const model = models.find((candidate) => candidate.value === value)
                const label =
                  model?.label ??
                  (value === null || value === ""
                    ? models.length === 0
                      ? "No Models Reported"
                      : "Select A Model"
                    : value)
                return (
                  <>
                    <RuntimeProviderIcon runtimeId={runtime} />
                    {label}
                  </>
                )
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {groupRuntimeModelOptions(models).map((group, index) => (
              <SelectGroup key={group.label ?? `ungrouped-${index}`}>
                {group.label ? <SelectLabel>{group.label}</SelectLabel> : null}
                {group.options.map((model) => (
                  <SelectItem key={model.value} value={model.value}>
                    <RuntimeProviderIcon runtimeId={runtime} />
                    {model.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <RuntimeFieldHeading
          htmlFor="reasoning-effort"
          label="Reasoning Effort"
          description={
            selectedEfforts.length === 0
              ? "This model does not accept a reasoning effort."
              : "Higher effort spends more subscription usage per run."
          }
        />
        {selectedEfforts.length === 0 ? (
          <div
            id="reasoning-effort"
            className="flex h-8 items-center rounded-lg border border-dashed px-2.5 text-sm text-muted-foreground"
          >
            Not Applicable
          </div>
        ) : (
          <Select
            items={selectedEfforts.map((effort) => ({
              label: reasoningEffortLabel(effort),
              value: effort,
            }))}
            value={draft.reasoningEffort}
            onValueChange={(value) =>
              value && onChange({ reasoningEffort: value as RuntimeReasoningEffort })
            }
          >
            <SelectTrigger id="reasoning-effort" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {selectedEfforts.map((effort) => (
                  <SelectItem key={effort} value={effort}>
                    {reasoningEffortLabel(effort)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </Field>
    </div>
  )
}

function RuntimeFieldHeading({
  htmlFor,
  label,
  description,
}: {
  htmlFor: string
  label: string
  description: string
}) {
  return (
    <div className="flex items-center gap-1">
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      <InfoButton description={description} />
    </div>
  )
}

function RuntimeFieldsSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Checking Subscription Runtimes"
      className="grid gap-4"
    >
      <div className="grid gap-1">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-8 w-full rounded-lg" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1">
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-8 w-full rounded-lg" />
        </div>
        <div className="grid gap-1">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-8 w-full rounded-lg" />
        </div>
      </div>
    </div>
  )
}
