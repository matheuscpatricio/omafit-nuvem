import { describe, expect, it } from 'vitest';
import { shouldAllowStoreLayoutOverride } from './parseTryonLayoutFromUrl';

describe('shouldAllowStoreLayoutOverride', () => {
  it('allows override when URL has default layout', () => {
    expect(shouldAllowStoreLayoutOverride('default', undefined)).toBe(true);
  });

  it('allows override when URL omits layout', () => {
    expect(shouldAllowStoreLayoutOverride(undefined, undefined)).toBe(true);
  });

  it('blocks override when URL locks sidebar or hero', () => {
    expect(shouldAllowStoreLayoutOverride('sidebar', undefined)).toBe(false);
    expect(shouldAllowStoreLayoutOverride('hero', undefined)).toBe(false);
  });

  it('blocks when parent passes tryonLayoutOverride', () => {
    expect(shouldAllowStoreLayoutOverride(undefined, 'sidebar')).toBe(false);
  });
});
