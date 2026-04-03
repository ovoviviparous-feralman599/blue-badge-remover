import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CollectedFadak } from '../../src/shared/types';

// Mock chrome.storage before importing modules
vi.mock('wxt/browser', () => ({
  browser: { storage: { local: { get: vi.fn(), set: vi.fn() } } },
}));

// Mock feature modules
const mockGetCollectedFadaks = vi.fn<() => Promise<CollectedFadak[]>>();
const mockSaveCollectedFadaks = vi.fn<(fadaks: CollectedFadak[]) => Promise<void>>();
vi.mock('@features/keyword-collector', () => ({
  getCollectedFadaks: (...args: unknown[]) => mockGetCollectedFadaks(...(args as [])),
  saveCollectedFadaks: (...args: unknown[]) => mockSaveCollectedFadaks(...(args as [CollectedFadak[]])),
}));
vi.mock('@features/keyword-filter', () => ({
  DEFAULT_FILTER_LIST: '',
  getCustomFilterList: vi.fn().mockResolvedValue(''),
  buildActiveRules: vi.fn().mockReturnValue([]),
  parseCategories: vi.fn().mockReturnValue([]),
  buildFilterTextFromCategories: vi.fn().mockReturnValue(''),
  ProfileCache: class { get() {} set() {} has() { return false; } },
}));

// Import the real collectorBuffer from state so we can inspect it
import { collectorBuffer } from '../../src/content/state';
import { bufferCollectedFadak, flushCollector } from '../../src/content/collector-buffer';

beforeEach(() => {
  collectorBuffer.clear();
  vi.clearAllMocks();
  mockSaveCollectedFadaks.mockResolvedValue(undefined);
});

describe('flushCollector', () => {
  it('flush 후 collectorBuffer가 비워져야 한다', async () => {
    mockGetCollectedFadaks.mockResolvedValue([]);

    bufferCollectedFadak('user1', 'handle1', 'Display1', 'bio', 'tweet text');
    expect(collectorBuffer.size).toBe(1);

    await flushCollector();

    expect(mockSaveCollectedFadaks).toHaveBeenCalledOnce();
    expect(collectorBuffer.size).toBe(0);
  });

  it('빈 버퍼는 flush를 건너뛴다', async () => {
    await flushCollector();
    expect(mockGetCollectedFadaks).not.toHaveBeenCalled();
    expect(mockSaveCollectedFadaks).not.toHaveBeenCalled();
  });

  it('기존 데이터와 병합 후 버퍼가 비워진다', async () => {
    const existing: CollectedFadak[] = [{
      userId: 'user1', handle: 'handle1', displayName: 'Old',
      bio: 'old bio', tweetTexts: ['old tweet'],
      firstSeenAt: 1000, lastSeenAt: 1000,
    }];
    mockGetCollectedFadaks.mockResolvedValue(existing);

    bufferCollectedFadak('user1', 'handle1', 'New', 'new bio', 'new tweet');
    await flushCollector();

    expect(collectorBuffer.size).toBe(0);
    const saved = mockSaveCollectedFadaks.mock.calls[0]![0]!;
    expect(saved).toHaveLength(1);
    expect(saved[0]!.displayName).toBe('New');
    expect(saved[0]!.tweetTexts).toContain('old tweet');
    expect(saved[0]!.tweetTexts).toContain('new tweet');
  });
});
