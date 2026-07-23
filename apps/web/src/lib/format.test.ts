import { describe, expect, it } from 'vitest';
import { springText } from './format.ts';

describe('spring-rate display units', () => {
  it('shows FH6 metric spring values directly in N/mm', () => {
    expect(springText(60.8, 'N/mm', 'metric')).toBe('60.8 N/mm');
  });

  it('converts canonical N/mm values for imperial display', () => {
    expect(springText(60.8, 'N/mm', 'imperial')).toBe('347 lbf/in');
  });
});