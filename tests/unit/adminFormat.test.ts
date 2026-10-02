import { describe, expect, it } from 'vitest';
import { describeFrequencies, formatBytes, formatCount } from '../../utils/adminFormat';

// Whole numbers only: group and decimal separators depend on the machine's locale.

describe('formatCount', () => {
  it('shows whole numbers as they are', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(7)).toBe('7');
  });
});

describe('formatBytes', () => {
  it('picks the unit', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(2 * 1024)).toBe('2 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3 MB');
  });
});

describe('describeFrequencies', () => {
  it('lists the ones in use, most common kinds first, and skips the rest', () => {
    expect(describeFrequencies({ 'one-time': 4, monthly: 12, weekly: 3, daily: 0 })).toBe('Monthly 12 · Weekly 3 · One-time 4');
  });

  it('is empty when there are no expenses', () => {
    expect(describeFrequencies({})).toBe('');
  });

  it('includes values outside the fixed list as "Other"', () => {
    expect(describeFrequencies({ other: 2 })).toBe('Other 2');
  });
});
