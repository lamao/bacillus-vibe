import { describe, expect, it } from 'vitest';
import { ALL_SUBSTANCES, Entity } from '../../src/engine/types';
import {
  categoricalValueOf,
  continuousFieldMax,
  continuousValueOf,
  defaultHighlightState,
  isCategoricalHighlightField,
  selectableSubstancesFor,
} from '../../src/ui/highlight';
import { dna, mineral, organic } from '../engine/fixtures';

describe('defaultHighlightState', () => {
  it('starts disabled', () => {
    expect(defaultHighlightState().enabled).toBe(false);
  });
});

describe('isCategoricalHighlightField', () => {
  it('classifies DNA fields as categorical and the rest as continuous', () => {
    expect(isCategoricalHighlightField('body')).toBe(true);
    expect(isCategoricalHighlightField('consume')).toBe(true);
    expect(isCategoricalHighlightField('produce')).toBe(true);
    expect(isCategoricalHighlightField('toxin')).toBe(true);
    expect(isCategoricalHighlightField('age')).toBe(false);
    expect(isCategoricalHighlightField('size')).toBe(false);
    expect(isCategoricalHighlightField('energy')).toBe(false);
  });
});

describe('selectableSubstancesFor', () => {
  it('excludes Sun for body/produce/toxin', () => {
    expect(selectableSubstancesFor('body', ALL_SUBSTANCES)).not.toContain('Sun');
    expect(selectableSubstancesFor('produce', ALL_SUBSTANCES)).not.toContain('Sun');
    expect(selectableSubstancesFor('toxin', ALL_SUBSTANCES)).not.toContain('Sun');
  });

  it('includes Sun for consume', () => {
    expect(selectableSubstancesFor('consume', ALL_SUBSTANCES)).toContain('Sun');
  });
});

describe('categoricalValueOf', () => {
  const org: Entity = organic({ x: 0, y: 0 }, { dna: dna({ body: 'Blue', consume: 'Sun', produce: 'Yellow', toxin: 'Red' }) });
  const min: Entity = mineral({ x: 1, y: 0 }, 'Green', 50);

  it('reads dna.body for organics and substance for minerals (both via substanceOf)', () => {
    expect(categoricalValueOf(org, 'body')).toBe('Blue');
    expect(categoricalValueOf(min, 'body')).toBe('Green');
  });

  it('reads organic-only dna fields, and returns null for minerals', () => {
    expect(categoricalValueOf(org, 'consume')).toBe('Sun');
    expect(categoricalValueOf(org, 'toxin')).toBe('Red');
    expect(categoricalValueOf(min, 'consume')).toBeNull();
    expect(categoricalValueOf(min, 'toxin')).toBeNull();
  });
});

describe('continuousValueOf', () => {
  const org: Entity = organic({ x: 0, y: 0 }, { size: 900, energy: 400, age: 120 });
  const min: Entity = mineral({ x: 1, y: 0 }, 'Green', 50);

  it('reads size for both organics and minerals', () => {
    expect(continuousValueOf(org, 'size')).toBe(900);
    expect(continuousValueOf(min, 'size')).toBe(50);
  });

  it('reads age/energy for organics, and returns null for minerals', () => {
    expect(continuousValueOf(org, 'age')).toBe(120);
    expect(continuousValueOf(org, 'energy')).toBe(400);
    expect(continuousValueOf(min, 'age')).toBeNull();
    expect(continuousValueOf(min, 'energy')).toBeNull();
  });
});

describe('continuousFieldMax', () => {
  const settings = { maxAge: 1500, maxSize: 2200 };

  it('normalizes age against maxAge', () => {
    expect(continuousFieldMax('age', settings)).toBe(1500);
  });

  it('normalizes size and energy against maxSize', () => {
    expect(continuousFieldMax('size', settings)).toBe(2200);
    expect(continuousFieldMax('energy', settings)).toBe(2200);
  });
});
