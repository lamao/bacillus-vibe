import { Entity, Substance, substanceOf } from '../engine/types';

/** DNA-keyed fields rendered as gray-out: everything but the matching value dims. */
export type CategoricalHighlightField = 'body' | 'consume' | 'produce' | 'toxin';

/** Fields rendered as a fixed-scale heatmap across the whole grid. */
export type ContinuousHighlightField = 'age' | 'size' | 'energy';

export type HighlightField = CategoricalHighlightField | ContinuousHighlightField;

export const CATEGORICAL_HIGHLIGHT_FIELDS: readonly CategoricalHighlightField[] = ['body', 'consume', 'produce', 'toxin'];
export const CONTINUOUS_HIGHLIGHT_FIELDS: readonly ContinuousHighlightField[] = ['age', 'size', 'energy'];

export function isCategoricalHighlightField(field: HighlightField): field is CategoricalHighlightField {
  return (CATEGORICAL_HIGHLIGHT_FIELDS as readonly string[]).includes(field);
}

/**
 * Transient UI state for the cell-highlight feature (#78): purely client-side, never
 * serialized, and reset to off implicitly on page reload since nothing persists it.
 * `selectedValue` only matters for categorical fields — a continuous field's whole grid
 * renders on its gradient, so no value to pick.
 */
export interface HighlightState {
  enabled: boolean;
  field: HighlightField;
  selectedValue?: Substance;
}

export function defaultHighlightState(): HighlightState {
  return { enabled: false, field: 'body' };
}

/** Substances selectable for a given categorical field — `consume` alone may be Sun. */
export function selectableSubstancesFor(field: CategoricalHighlightField, allSubstances: readonly Substance[]): readonly Substance[] {
  if (field === 'consume') return allSubstances;
  return allSubstances.filter((substance) => substance !== 'Sun');
}

/**
 * The entity's value for a categorical field, or null if the field has no meaning for
 * it — e.g. `consume`/`produce`/`toxin` for a mineral, which has no DNA. `body` applies
 * to minerals too, via the same substance identity `substanceOf` already uses for color.
 */
export function categoricalValueOf(entity: Entity, field: CategoricalHighlightField): Substance | null {
  if (field === 'body') return substanceOf(entity);
  return entity.kind === 'organic' ? entity.dna[field] : null;
}

/**
 * The entity's value for a continuous field, or null if the field has no meaning for
 * it — `age`/`energy` are organic-only; `size` applies to minerals too.
 */
export function continuousValueOf(entity: Entity, field: ContinuousHighlightField): number | null {
  if (field === 'size') return entity.size;
  return entity.kind === 'organic' ? entity[field] : null;
}

/** Fixed normalization ceiling for a continuous field's heatmap, per the engine settings driving it. */
export function continuousFieldMax(field: ContinuousHighlightField, settings: { maxAge: number; maxSize: number }): number {
  return field === 'age' ? settings.maxAge : settings.maxSize;
}

export const HIGHLIGHT_FIELD_LABELS: Record<HighlightField, string> = {
  body: 'Body',
  consume: 'Consume',
  produce: 'Produce',
  toxin: 'Toxin',
  age: 'Age',
  size: 'Size',
  energy: 'Energy',
};
