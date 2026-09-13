/**
 * THE DEAD-END GATE.
 *
 * Refusing to show a verdict while hiding the one field that would produce it
 * is a dead end anyone would hit, and nothing would have caught it: the field
 * exists, the config is valid, every test passes and the page renders. The only
 * symptom is a person staring at a page that will not answer, with no way to
 * know which box to fill in.
 */
import { describe, expect, it } from 'vitest';
import { strategies } from './index';
import { missingForVerdict, requiredFieldsAreVisible } from './required';

describe('every field a verdict needs is reachable without opening anything', () => {
  it.each(strategies.map((s) => [s.id, s] as const))(
    '%s: no required field is hidden in the collapsed assumptions',
    (_id, config) => {
      expect(requiredFieldsAreVisible(config)).toEqual([]);
    },
  );

  it.each(strategies.map((s) => [s.id, s] as const))(
    '%s: names at least one required field, so the page can say what it wants',
    (_id, config) => {
      expect(config.requiredForVerdict.length).toBeGreaterThan(0);
    },
  );

  it.each(strategies.map((s) => [s.id, s] as const))(
    '%s: every required key is a real field with a label to print',
    (_id, config) => {
      const all = [...config.strategyInputs, ...config.assumptions];
      for (const key of config.requiredForVerdict) {
        const field = all.find((f) => f.key === key);
        expect(field, `${config.id} requires "${key}" which is not a field`).toBeDefined();
        expect(field!.label.trim(), `${config.id}.${key} has no label`).not.toBe('');
      }
    },
  );
});

describe('what the page is waiting for', () => {
  it('a blank form is missing every required field', () => {
    for (const config of strategies) {
      const missing = missingForVerdict(config, {});
      expect(missing.map((f) => f.key)).toEqual([...config.requiredForVerdict]);
    }
  });

  it('a filled form is missing none', () => {
    for (const config of strategies) {
      const params = Object.fromEntries(config.requiredForVerdict.map((k) => [k, '750']));
      expect(missingForVerdict(config, params)).toEqual([]);
    }
  });

  it('zero, blank and rubbish all count as missing — they are not numbers a verdict can use', () => {
    for (const config of strategies) {
      for (const bad of ['', '0', '   ', 'abc', '-5']) {
        const params = Object.fromEntries(config.requiredForVerdict.map((k) => [k, bad]));
        expect(missingForVerdict(config, params).length, `${config.id} "${bad}"`).toBeGreaterThan(0);
      }
    }
  });
});
