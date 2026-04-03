import { describe, it, expect } from 'vitest';
import { parseBadgeInfo } from '@features/badge-detection/api-parser';

describe('parseBadgeInfo', () => {
  it('should detect Premium subscriber (fadak)', () => {
    const userData = {
      rest_id: '12345',
      is_blue_verified: true,
      legacy: { verified: false, screen_name: 'testuser' },
    };
    const result = parseBadgeInfo(userData);
    expect(result).toEqual({
      userId: '12345',
      handle: 'testuser',
      isBluePremium: true,
      isLegacyVerified: false,
      isBusiness: false,
    });
  });

  it('should return handle from legacy.screen_name', () => {
    const userData = {
      rest_id: '12345',
      is_blue_verified: true,
      legacy: { verified: false, screen_name: 'from_legacy' },
      core: { screen_name: 'from_core' },
    };
    const result = parseBadgeInfo(userData);
    expect(result?.handle).toBe('from_legacy');
  });

  it('should fallback to core.screen_name when legacy has no screen_name', () => {
    const userData = {
      rest_id: '12345',
      is_blue_verified: true,
      legacy: { verified: false },
      core: { screen_name: 'from_core' },
    };
    const result = parseBadgeInfo(userData);
    expect(result?.handle).toBe('from_core');
  });

  it('should return null handle when no screen_name available', () => {
    const userData = {
      rest_id: '12345',
      is_blue_verified: true,
      legacy: { verified: false },
    };
    const result = parseBadgeInfo(userData);
    expect(result?.handle).toBeNull();
  });

  it('should detect legacy verified account', () => {
    const userData = {
      rest_id: '67890',
      is_blue_verified: true,
      legacy: { verified: true },
    };
    const result = parseBadgeInfo(userData);
    expect(result?.isBluePremium).toBe(false);
    expect(result?.isLegacyVerified).toBe(true);
  });

  it('should detect business account', () => {
    const userData = {
      rest_id: '11111',
      is_blue_verified: true,
      verified_type: 'Business',
      legacy: { verified: false },
    };
    const result = parseBadgeInfo(userData);
    expect(result?.isBusiness).toBe(true);
    expect(result?.isBluePremium).toBe(false);
  });

  it('should return null for non-verified user', () => {
    const userData = {
      rest_id: '99999',
      is_blue_verified: false,
      legacy: { verified: false },
    };
    const result = parseBadgeInfo(userData);
    expect(result).toBeNull();
  });

  it('should return null for malformed data', () => {
    const result = parseBadgeInfo({});
    expect(result).toBeNull();
  });
});
