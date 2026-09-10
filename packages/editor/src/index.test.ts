import { describe, expect, it } from 'vitest';

import { PACKAGE_API_VERSION, PACKAGE_NAME } from './index.js';

describe('package entry point', () => {
  it('exposes stable package metadata', () => {
    expect(PACKAGE_NAME).toBe('scriptr-editor');
    expect(PACKAGE_API_VERSION).toBe(0);
  });
});
