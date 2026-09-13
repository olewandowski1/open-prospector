"use client"

import {
  AlertCircleIcon,
  Cancel01Icon,
  Loading03Icon,
  Settings02Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import Link from "next/link"
import { useState, useTransition } from "react"
import { FormFieldLabel } from "@/components/form-field-label"
import { Icon } from "@/components/icon"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  defaultRuntimeExecutionConfiguration,
  groupRuntimeModelOptions,
  type RuntimeId,
  type RuntimeModelCatalog,
  RuntimeProviderIcon,
  type RuntimeReadiness,
  type RuntimeReasoningEffort,
  reasoningEffortLabel,
  resolveRuntimeConfiguration,
  runtimeModelOptions,
  runtimeReasoningEfforts,
} from "@/features/runtime-settings/client"
import { cn } from "@/lib/utils"

export type RuntimeSteering = Readonly<{
  runtimeId: RuntimeId
  model: string
  reasoningEffort: RuntimeReasoningEffort
}>

const fieldSpacing = "gap-1"

const steeringOf = (runtimeId: RuntimeId, modelCatalog?: RuntimeModelCatalog): RuntimeSteering => ({
  runtimeId,
  ...defaultRuntimeExecutionConfiguration(runtimeId, modelCatalog?.[runtimeId]),
})

const isSameSteering = (left: RuntimeSteering, right?: RuntimeSteering) =>
  left.runtimeId === right?.runtimeId &&
  left.model === right.model &&
  left.reasoningEffort === right.reasoningEffort

export function RuntimeSteeringPanel({
  runtimes,
  modelCatalog,
  steering,
  saveSteering,
}: {
  runtimes: readonly RuntimeReadiness[]
  modelCatalog?: RuntimeModelCatalog
  steering?: RuntimeSteering
  saveSteering: (steering: RuntimeSteering) => Promise<void>
}) {
  const readyRuntimes = runtimes.filter((runtime) => runtime.status === "Ready")
  const fallbackRuntime = readyRuntimes[0]?.runtimeId
  const [draft, setDraft] = useState<RuntimeSteering | undefined>(
    steering ?? (fallbackRuntime ? steeringOf(fallbackRuntime, modelCatalog) : undefined),
  )
  const [saved, setSaved] = useState(steering)
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  const selectedRuntime = runtimes.find((runtime) => runtime.runtimeId === draft?.runtimeId)
  const models = draft ? runtimeModelOptions(draft.runtimeId, modelCatalog) : []
  const efforts = draft ? runtimeReasoningEfforts(draft.runtimeId, draft.model, models) : []
  const unchanged = draft !== undefined && isSameSteering(draft, saved)

  const selectModel = (model: string) =>
    setDraft(
      (current) =>
        current && {
          runtimeId: current.runtimeId,
          ...resolveRuntimeConfiguration(current.runtimeId, model, current.reasoningEffort, models),
        },
    )

  const save = () => {
    if (!draft) return
    setError("")
    startTransition(async () => {
      try {
        await saveSteering(draft)
        setSaved(draft)
      } catch {
        setError("The steering choice could not be stored locally.")
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-heading text-base font-semibold tracking-tight">Run Steering</h2>
            {selectedRuntime ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-sm",
                  selectedRuntime.status === "Ready" ? "text-success" : "text-destructive",
                )}
              >
                {selectedRuntime.status === "Ready" ? (
                  <Icon icon={Tick02Icon} className="size-3.5" />
                ) : (
                  <Icon icon={Cancel01Icon} className="size-3.5" />
                )}
                {selectedRuntime.status === "Ready" ? "Ready" : "Not Ready"}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
            The runtime, model, and reasoning effort that new prospecting runs start from. Provider
            logins stay in their own terminals.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {draft ? (
          <div className="grid gap-5 sm:grid-cols-3">
            <Field className={fieldSpacing}>
              <FormFieldLabel
                htmlFor="steering-runtime"
                label="Subscription Runtime"
                description="Only authenticated runtimes can be selected."
              />
              <Select
                items={runtimes.map((runtime) => ({
                  label: runtime.label,
                  value: runtime.runtimeId,
                }))}
                value={draft.runtimeId}
                onValueChange={(value) =>
                  value && setDraft(steeringOf(value as RuntimeId, modelCatalog))
                }
              >
                <SelectTrigger
                  id="steering-runtime"
                  aria-label="Subscription Runtime"
                  className="w-full"
                >
                  <SelectValue>
                    {(value: string | null) => {
                      const runtime = runtimes.find((item) => item.runtimeId === value)
                      if (!runtime) return "Select a runtime"
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
                    {runtimes.map((runtime) => (
                      <SelectItem
                        key={runtime.runtimeId}
                        value={runtime.runtimeId}
                        disabled={runtime.status !== "Ready"}
                      >
                        <RuntimeProviderIcon runtimeId={runtime.runtimeId} />
                        {runtime.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field className={fieldSpacing}>
              <FormFieldLabel
                htmlFor="steering-model"
                label="Model"
                description={
                  models.find((model) => model.value === draft.model)?.detail ??
                  "Choose the model this workspace should default to."
                }
              />
              <Select
                items={models.map((model) => ({ label: model.label, value: model.value }))}
                value={draft.model}
                onValueChange={(value) => value && selectModel(value)}
              >
                <SelectTrigger
                  id="steering-model"
                  aria-label="Model"
                  className="w-full"
                  disabled={models.length === 0}
                >
                  <SelectValue>
                    {(value: string | null) => {
                      const model = models.find((candidate) => candidate.value === value)
                      const label =
                        model?.label ?? (models.length === 0 ? "No Models Reported" : value)
                      return (
                        <>
                          <RuntimeProviderIcon runtimeId={draft.runtimeId} />
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
                          <RuntimeProviderIcon runtimeId={draft.runtimeId} />
                          {model.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field className={fieldSpacing}>
              <FormFieldLabel
                htmlFor="steering-effort"
                label="Reasoning Effort"
                description={
                  efforts.length === 0
                    ? "This model does not accept a reasoning effort."
                    : "Higher effort spends more usage per run."
                }
              />
              {efforts.length === 0 ? (
                <div
                  id="steering-effort"
                  className="flex h-8 items-center rounded-lg border border-dashed px-2.5 text-sm text-muted-foreground"
                >
                  Not Applicable
                </div>
              ) : (
                <Select
                  items={efforts.map((effort) => ({
                    label: reasoningEffortLabel(effort),
                    value: effort,
                  }))}
                  value={draft.reasoningEffort}
                  onValueChange={(value) =>
                    value &&
                    setDraft(
                      (current) =>
                        current && { ...current, reasoningEffort: value as RuntimeReasoningEffort },
                    )
                  }
                >
                  <SelectTrigger
                    id="steering-effort"
                    aria-label="Reasoning Effort"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {efforts.map((effort) => (
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
        ) : (
          <Alert>
            <Icon icon={AlertCircleIcon} />
            <AlertTitle>No Authenticated Runtime</AlertTitle>
            <AlertDescription>
              Sign in to Codex or Claude in their terminals, then confirm readiness in settings.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={!draft || pending || unchanged}>
            {pending ? <Icon icon={Loading03Icon} data-icon="inline-start" /> : null}
            Save Steering
          </Button>
          <Link href="/settings/subscription" className={buttonVariants({ variant: "ghost" })}>
            <Icon icon={Settings02Icon} data-icon="inline-start" />
            Runtime Settings
          </Link>
          <p role="status" className="text-xs text-muted-foreground">
            {error}
          </p>
        </div>
      </div>
    </div>
  )
}
