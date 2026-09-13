import { Context, Data, Effect, Option } from "effect"

import {
  defaultRuntimeExecutionConfiguration,
  type RuntimeExecutionConfiguration,
  type RuntimeModelOption,
} from "@/features/runtime-settings/application/runtime-execution-configuration"
import type { RuntimeId } from "@/features/runtime-settings/application/runtime-readiness"

export class RuntimePreferenceError extends Data.TaggedError("RuntimePreferenceError")<{
  readonly operation: "read" | "write"
}> {}

export type SelectedRuntimePreference = Readonly<{
  runtimeId: RuntimeId
  configuration: RuntimeExecutionConfiguration
}>

export interface RuntimePreferenceRepositoryService {
  readonly getSelected: Effect.Effect<
    Option.Option<SelectedRuntimePreference>,
    RuntimePreferenceError
  >
  readonly setSelected: (
    preference: SelectedRuntimePreference,
  ) => Effect.Effect<void, RuntimePreferenceError>
}

export class RuntimePreferenceRepository extends Context.Tag(
  "RuntimeSettings/RuntimePreferenceRepository",
)<RuntimePreferenceRepository, RuntimePreferenceRepositoryService>() {}

export const getSelectedRuntimePreference = Effect.flatMap(
  RuntimePreferenceRepository,
  (repository) => repository.getSelected,
)

export const getSelectedRuntime = Effect.map(getSelectedRuntimePreference, (preference) =>
  Option.map(preference, ({ runtimeId }) => runtimeId),
)

export const setSelectedRuntime = (
  runtimeId: RuntimeId,
  modelOptions?: readonly RuntimeModelOption[],
) =>
  setSelectedRuntimePreference({
    runtimeId,
    configuration: defaultRuntimeExecutionConfiguration(runtimeId, modelOptions),
  })

export const setSelectedRuntimePreference = (preference: SelectedRuntimePreference) =>
  Effect.flatMap(RuntimePreferenceRepository, (repository) => repository.setSelected(preference))
