"use client"

import { Tick02Icon } from "@hugeicons/core-free-icons"

import { Icon } from "@/components/icon"
import { InfoButton } from "@/components/info-button"
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  categoryPresets,
  type SearchBriefDraftState,
} from "@/features/prospecting-runs/presentation/search-brief-draft"
import { SearchBriefRuntimeFields } from "@/features/prospecting-runs/presentation/search-brief-runtime-fields"
import type { RuntimeModelCatalog, RuntimeReadiness } from "@/features/runtime-settings/client"

const categoryLabels: Record<(typeof categoryPresets)[number], string> = {
  "Dental clinics": "Dental Clinics",
  Restaurants: "Restaurants",
  "Beauty salons": "Beauty Salons",
  "Construction companies": "Construction Companies",
  "Law firms": "Law Firms",
  "Custom category": "Custom Category",
}

export function SearchBriefFields({
  draft,
  readyRuntimes,
  modelCatalog,
  runtimeLoading,
  runtimeError,
  onChange,
  onSubmit,
}: {
  draft: SearchBriefDraftState
  readyRuntimes: readonly RuntimeReadiness[]
  modelCatalog?: RuntimeModelCatalog
  runtimeLoading: boolean
  runtimeError: string
  onChange: (next: Partial<SearchBriefDraftState>) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}) {
  return (
    <section aria-labelledby="search-scope-heading">
      <div id="search-scope-heading">
        <FormSectionHeading
          title="Search Criteria"
          description="Choose the market and the number of businesses to find. Poland is assumed unless you include another country."
        />
      </div>
      <form id="new-run-brief" onSubmit={onSubmit}>
        <FieldGroup className="mt-4 gap-4 [&_[data-slot=field]]:gap-1 [&_[data-slot=field-label]]:font-normal">
          <SearchCriteriaFields draft={draft} onChange={onChange} />
          <RunSettingsFields draft={draft} onChange={onChange} />
          <SearchBriefRuntimeFields
            draft={draft}
            readyRuntimes={readyRuntimes}
            modelCatalog={modelCatalog}
            loading={runtimeLoading}
            error={runtimeError}
            onChange={onChange}
          />
        </FieldGroup>
      </form>
    </section>
  )
}

function SearchCriteriaFields({
  draft,
  onChange,
}: {
  draft: SearchBriefDraftState
  onChange: (next: Partial<SearchBriefDraftState>) => void
}) {
  return (
    <>
      <Field>
        <FieldHeading
          htmlFor="location"
          label="City Or Municipality"
          description="Include a country when searching outside Poland. The location is checked before the run is created."
        />
        <Input
          id="location"
          name="location"
          placeholder="e.g. Krakow or Berlin, Germany"
          value={draft.location}
          onChange={(event) => onChange({ location: event.target.value })}
          required
        />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field>
          <FieldHeading
            htmlFor="radius"
            label="Radius In Kilometres (Optional)"
            description="Leave blank to search within the place itself."
          />
          <Input
            id="radius"
            name="radius"
            type="number"
            min="0"
            step="1"
            value={draft.radiusKm}
            onChange={(event) => onChange({ radiusKm: event.target.value })}
            placeholder="City Limits"
          />
        </Field>
        <Field>
          <FieldHeading
            htmlFor="target"
            label="Target Businesses"
            description="Choose any value from 5 through 50."
          />
          <Input
            id="target"
            name="target"
            type="number"
            min="5"
            max="50"
            step="1"
            value={draft.targetCount}
            onChange={(event) => onChange({ targetCount: event.target.value })}
            required
          />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="category">Business Category</FieldLabel>
        <Select
          items={categoryPresets.map((category) => ({
            label: categoryLabels[category],
            value: category,
          }))}
          value={draft.categoryChoice}
          onValueChange={(value) => value && onChange({ categoryChoice: value })}
        >
          <SelectTrigger id="category" aria-label="Business Category" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {categoryPresets.map((category) => (
                <SelectItem key={category} value={category}>
                  {categoryLabels[category]}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      {draft.categoryChoice === "Custom category" ? (
        <Field>
          <FieldLabel htmlFor="custom-category">Custom Category</FieldLabel>
          <Input
            id="custom-category"
            value={draft.customCategory}
            onChange={(event) => onChange({ customCategory: event.target.value })}
            placeholder="e.g. Independent Climbing Gyms"
            required
          />
        </Field>
      ) : null}
    </>
  )
}

function RunSettingsFields({
  draft,
  onChange,
}: {
  draft: SearchBriefDraftState
  onChange: (next: Partial<SearchBriefDraftState>) => void
}) {
  return (
    <>
      <FormSectionHeading
        title="Run Settings"
        description="Choose how deeply to search and how to handle businesses assessed before."
      />
      <FieldSet className="gap-1">
        <FieldLegend variant="label">Run Mode</FieldLegend>
        <RadioGroup
          value={draft.mode}
          onValueChange={(value) =>
            value && onChange({ mode: value as SearchBriefDraftState["mode"] })
          }
          className="flex h-8 w-52 max-w-full gap-0 overflow-hidden rounded-lg border border-input bg-transparent dark:bg-input/20"
        >
          {(["Quick", "Thorough"] as const).map((mode) => (
            <label
              key={mode}
              htmlFor={`run-mode-${mode.toLowerCase()}`}
              className="block h-full min-w-0 flex-1 cursor-pointer"
            >
              <RadioGroupItem
                id={`run-mode-${mode.toLowerCase()}`}
                value={mode}
                aria-label={mode}
                className="peer absolute! size-px! overflow-hidden border-0! p-0! opacity-0"
              />
              <span className="flex h-full w-full items-center justify-center gap-1.5 px-3 text-sm leading-normal text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground peer-data-checked:bg-muted peer-data-checked:text-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-inset peer-focus-visible:ring-ring/50">
                <Icon
                  icon={Tick02Icon}
                  className={draft.mode === mode ? "size-3.5 text-success" : "invisible size-3.5"}
                />
                <span>{mode}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </FieldSet>
      <Field>
        <FieldHeading
          htmlFor="recent-business-policy"
          label="Recently Assessed Businesses"
          description="Reassessment is always an explicit choice and never overwrites history."
        />
        <Select
          items={[
            { label: "Skip By Default", value: "Skip" },
            { label: "Include Existing Assessment", value: "IncludeWithoutReassessment" },
            { label: "Explicitly Reassess", value: "Reassess" },
          ]}
          value={draft.recentBusinessPolicy}
          onValueChange={(value) =>
            value &&
            onChange({
              recentBusinessPolicy: value as SearchBriefDraftState["recentBusinessPolicy"],
            })
          }
        >
          <SelectTrigger
            id="recent-business-policy"
            aria-label="Recently Assessed Businesses"
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="Skip">Skip By Default</SelectItem>
              <SelectItem value="IncludeWithoutReassessment">
                Include Existing Assessment
              </SelectItem>
              <SelectItem value="Reassess">Explicitly Reassess</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </>
  )
}

function FormSectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <h2 className="font-heading text-lg font-semibold tracking-tight">{title}</h2>
      <InfoButton description={description} />
    </div>
  )
}

function FieldHeading({
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
