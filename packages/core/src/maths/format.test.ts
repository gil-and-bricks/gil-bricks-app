import { describe, expect, it } from 'vitest';
import { fmtDate, fmtMoneyInput, moneyCaret, parseMoneyInput } from './format';

describe('money as it is typed (F1)', () => {
  it('reads back what the extension already showed: separators and a £', () => {
    expect(fmtMoneyInput('69995')).toBe('£69,995');
    expect(fmtMoneyInput('1250000')).toBe('£1,250,000');
    expect(fmtMoneyInput('950')).toBe('£950');
  });

  it('an empty field stays empty — never "£0"', () => {
    expect(fmtMoneyInput('')).toBe('');
    expect(fmtMoneyInput('abc')).toBe('');
    expect(parseMoneyInput('')).toBe('');
  });

  it('round-trips: what the URL holds is always the digits', () => {
    for (const raw of ['0', '1', '750', '69995', '1250000']) {
      expect(parseMoneyInput(fmtMoneyInput(raw))).toBe(raw);
    }
  });

  it('takes whatever a person types or pastes, and keeps only the number', () => {
    expect(parseMoneyInput('£69,995')).toBe('69995');
    expect(parseMoneyInput('69,995.00')).toBe('69995');   // whole pounds, never ×100
    expect(parseMoneyInput('1250.5')).toBe('1250');
    expect(parseMoneyInput('£1,250,000.99')).toBe('1250000');
    expect(parseMoneyInput('  £ 250 000 ')).toBe('250000');
    expect(parseMoneyInput('007')).toBe('7');
  });
});

describe('the caret stays where you are typing', () => {
  it('follows the digit, not the character index', () => {
    // "£69,95" with the caret after the 9 (index 4) → "£69,950" keeps that digit
    expect(moneyCaret('£6995', 3, '£6,995')).toBe(4);
    expect(moneyCaret('£1250000', 8, '£1,250,000')).toBe(10);
    expect(moneyCaret('', 0, '')).toBe(0);
  });

  it('a correction in the middle does not jump to the end', () => {
    const typed = '£1,50,000';            // a digit deleted mid-number
    const raw = parseMoneyInput(typed);   // 150000
    const formatted = fmtMoneyInput(raw); // £150,000
    expect(formatted).toBe('£150,000');
    expect(moneyCaret(typed, 5, formatted)).toBeLessThan(formatted.length);
  });
});

describe('fmtDate', () => {
  it('writes an ISO date the way a person reads it', () => {
    expect(fmtDate('2025-04-01')).toBe('1 April 2025');
    expect(fmtDate('2024-12-11')).toBe('11 December 2024');
  });

  it('hands back anything that is not an ISO date untouched', () => {
    expect(fmtDate('soon')).toBe('soon');
    expect(fmtDate('2025-04')).toBe('2025-04');
  });
});
