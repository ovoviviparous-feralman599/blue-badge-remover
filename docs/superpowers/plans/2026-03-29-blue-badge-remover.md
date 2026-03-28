# Blue Badge Remover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** X(트위터)에서 Premium 구독(파딱) 파란 뱃지 계정의 콘텐츠를 숨기는 크롬 익스텐션을 구현한다.

**Architecture:** Feature-Based Architecture. Content Script가 fetch 패치로 API 응답/토큰을 인터셉트하고, MutationObserver로 DOM을 감시하여 파딱 트윗을 숨긴다. Service Worker는 팔로우 목록 동기화를 담당한다.

**Tech Stack:** TypeScript, Chrome Extension Manifest V3, Vite + CRXJS, Vitest

**Spec:** `docs/superpowers/specs/2026-03-29-blue-badge-remover-design.md`

---

## File Structure

```
package.json
tsconfig.json
vite.config.ts
vitest.config.ts
src/
├── manifest.json
├── background/
│   └── index.ts                          # Service Worker 진입점
├── content/
│   └── index.ts                          # Content Script 진입점
├── injected/
│   └── fetch-interceptor.ts              # 페이지 컨텍스트에 주입되는 fetch 패치 스크립트
├── popup/
│   ├── index.html
│   ├── index.ts
│   └── style.css
├── features/
│   ├── badge-detection/
│   │   ├── index.ts                      # public API (detectBadge, isFadak)
│   │   ├── api-parser.ts                 # GraphQL 응답에서 파딱 판별
│   │   ├── svg-fallback.ts               # SVG 뱃지 DOM 감지 (폴백)
│   │   └── badge-cache.ts                # userId → 파딱 여부 메모리 캐시
│   ├── content-filter/
│   │   ├── index.ts                      # public API (initFilter, applyFilter)
│   │   ├── tweet-processor.ts            # 단일 트윗 처리 파이프라인
│   │   ├── tweet-hider.ts                # display:none / collapse 처리
│   │   └── observer.ts                   # MutationObserver 설정/해제
│   ├── follow-list/
│   │   ├── index.ts                      # public API
│   │   ├── follow-sync.ts               # X API 팔로우 목록 조회
│   │   └── whitelist.ts                  # 수동 화이트리스트 관리
│   └── settings/
│       ├── index.ts                      # public API
│       └── storage.ts                    # Chrome Storage 래퍼
└── shared/
    ├── types/
    │   └── index.ts                      # Settings, StorageSchema, BadgeInfo 등
    ├── constants/
    │   └── index.ts                      # DEFAULT_SETTINGS, STORAGE_KEYS
    └── utils/
        └── logger.ts                     # 구조화된 로거
tests/
├── features/
│   ├── badge-detection/
│   │   ├── api-parser.test.ts
│   │   ├── svg-fallback.test.ts
│   │   └── badge-cache.test.ts
│   ├── content-filter/
│   │   ├── tweet-processor.test.ts
│   │   └── tweet-hider.test.ts
│   ├── follow-list/
│   │   ├── follow-sync.test.ts
│   │   └── whitelist.test.ts
│   └── settings/
│       └── storage.test.ts
└── shared/
    └── utils/
        └── logger.test.ts
```

---

## Task 0: Project Bootstrap

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `src/manifest.json`
- Create: `.gitignore` (update)

- [ ] **Step 1: Initialize package.json**

```bash
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install -D typescript vite @crxjs/vite-plugin@beta vitest @types/chrome
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist",
    "rootDir": "src",
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["src/shared/*"],
      "@features/*": ["src/features/*"]
    },
    "types": ["chrome", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.json';
import { resolve } from 'path';

export default defineConfig({
  plugins: [crx({ manifest })],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@features': resolve(__dirname, 'src/features'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        injected: resolve(__dirname, 'src/injected/fetch-interceptor.ts'),
      },
    },
  },
});
```

- [ ] **Step 5: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@features': resolve(__dirname, 'src/features'),
    },
  },
});
```

- [ ] **Step 6: Create src/manifest.json**

```json
{
  "manifest_version": 3,
  "name": "Blue Badge Remover",
  "version": "0.1.0",
  "description": "X(트위터)에서 수익성 파란 뱃지 계정을 숨깁니다",
  "permissions": ["storage"],
  "host_permissions": ["https://x.com/*", "https://api.x.com/*"],
  "background": {
    "service_worker": "src/background/index.ts"
  },
  "content_scripts": [
    {
      "matches": ["https://x.com/*"],
      "js": ["src/content/index.ts"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "src/popup/index.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "web_accessible_resources": [
    {
      "resources": ["src/injected/fetch-interceptor.ts"],
      "matches": ["https://x.com/*"]
    }
  ]
}
```

- [ ] **Step 7: Update .gitignore**

`node_modules/`, `dist/`, `.env` 를 추가한다.

- [ ] **Step 8: Create placeholder entry points**

빌드가 깨지지 않도록 빈 진입점 파일을 생성한다:
- `src/background/index.ts` — `export {};`
- `src/content/index.ts` — `export {};`
- `src/injected/fetch-interceptor.ts` — `export {};`
- `src/popup/index.html` — 최소 HTML 셸
- `src/popup/index.ts` — `export {};`
- `src/popup/style.css` — 빈 파일

- [ ] **Step 9: Verify build**

```bash
npx vite build
```

Expected: 빌드 성공, `dist/` 생성

- [ ] **Step 10: Verify test runner**

```bash
npx vitest run
```

Expected: "No test files found" (아직 테스트 없음, 에러 없이 종료)

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: bootstrap project with Vite + CRXJS + Vitest"
```

---

## Task 1: Shared Types, Constants & Logger

**Files:**
- Create: `src/shared/types/index.ts`
- Create: `src/shared/constants/index.ts`
- Create: `src/shared/utils/logger.ts`
- Test: `tests/shared/utils/logger.test.ts`

- [ ] **Step 1: Write logger test**

```typescript
// tests/shared/utils/logger.test.ts
import { describe, it, expect, vi } from 'vitest';
import { logger } from '@shared/utils/logger';

describe('logger', () => {
  it('should log structured info message', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logger.info('test message', { key: 'value' });
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('"level":"info"'),
    );
    spy.mockRestore();
  });

  it('should log structured warn message', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger.warn('warning');
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('"level":"warn"'),
    );
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/shared/utils/logger.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create shared types**

```typescript
// src/shared/types/index.ts
export interface Settings {
  enabled: boolean;
  filter: {
    timeline: boolean;
    replies: boolean;
    search: boolean;
  };
  hideMode: 'remove' | 'collapse';
  retweetFilter: boolean;
  quoteMode: 'off' | 'quote-only' | 'entire';
}

export interface StorageSchema {
  settings: Settings;
  whitelist: string[];
  followList: string[];
  currentUserId: string | null;
  token: string | null;
  lastSyncAt: string | null;
}

export interface BadgeInfo {
  userId: string;
  isBluePremium: boolean;
  isLegacyVerified: boolean;
  isBusiness: boolean;
}

export type StorageKey = keyof StorageSchema;
```

- [ ] **Step 4: Create constants**

```typescript
// src/shared/constants/index.ts
import type { Settings } from '@shared/types';

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  filter: {
    timeline: true,
    replies: true,
    search: true,
  },
  hideMode: 'remove',
  retweetFilter: true,
  quoteMode: 'off',
};

export const STORAGE_KEYS = {
  SETTINGS: 'settings',
  WHITELIST: 'whitelist',
  FOLLOW_LIST: 'followList',
  CURRENT_USER_ID: 'currentUserId',
  TOKEN: 'token',
  LAST_SYNC_AT: 'lastSyncAt',
} as const;

export const X_GRAPHQL_ENDPOINTS = [
  '/i/api/graphql/',
  '/i/api/2/',
] as const;

export const MESSAGE_TYPES = {
  BADGE_DATA: 'BBR_BADGE_DATA',
  TOKEN_DATA: 'BBR_TOKEN_DATA',
} as const;
```

- [ ] **Step 5: Create logger**

```typescript
// src/shared/utils/logger.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...data,
  };
  const json = JSON.stringify(entry);
  const method = level === 'debug' ? 'debug' : level === 'info' ? 'info' : level === 'warn' ? 'warn' : 'error';
  console[method](json);
}

export const logger = {
  debug: (message: string, data?: Record<string, unknown>) => log('debug', message, data),
  info: (message: string, data?: Record<string, unknown>) => log('info', message, data),
  warn: (message: string, data?: Record<string, unknown>) => log('warn', message, data),
  error: (message: string, data?: Record<string, unknown>) => log('error', message, data),
};
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run tests/shared/utils/logger.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/shared/ tests/shared/
git commit -m "feat: add shared types, constants, and logger"
```

---

## Task 2: Settings Storage

**Files:**
- Create: `src/features/settings/storage.ts`
- Create: `src/features/settings/index.ts`
- Test: `tests/features/settings/storage.test.ts`

Chrome Storage API는 테스트에서 모킹한다 (외부 서비스).

- [ ] **Step 1: Write storage test**

```typescript
// tests/features/settings/storage.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSettings, saveSettings, getWhitelist, addToWhitelist, removeFromWhitelist } from '@features/settings/storage';
import { DEFAULT_SETTINGS } from '@shared/constants';

const mockStorage: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn((keys: string[]) =>
        Promise.resolve(
          Object.fromEntries(keys.filter((k) => k in mockStorage).map((k) => [k, mockStorage[k]])),
        ),
      ),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
        return Promise.resolve();
      }),
    },
  },
});

beforeEach(() => {
  Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
});

describe('getSettings', () => {
  it('should return default settings when storage is empty', async () => {
    const settings = await getSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it('should return stored settings', async () => {
    const custom = { ...DEFAULT_SETTINGS, enabled: false };
    mockStorage['settings'] = custom;
    const settings = await getSettings();
    expect(settings.enabled).toBe(false);
  });
});

describe('whitelist', () => {
  it('should return empty array when no whitelist', async () => {
    const list = await getWhitelist();
    expect(list).toEqual([]);
  });

  it('should add handle to whitelist', async () => {
    await addToWhitelist('@testuser');
    expect(mockStorage['whitelist']).toContain('@testuser');
  });

  it('should not add duplicate handle', async () => {
    mockStorage['whitelist'] = ['@testuser'];
    await addToWhitelist('@testuser');
    expect((mockStorage['whitelist'] as string[]).length).toBe(1);
  });

  it('should remove handle from whitelist', async () => {
    mockStorage['whitelist'] = ['@testuser', '@other'];
    await removeFromWhitelist('@testuser');
    expect(mockStorage['whitelist']).toEqual(['@other']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/features/settings/storage.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement storage**

```typescript
// src/features/settings/storage.ts
import type { Settings } from '@shared/types';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '@shared/constants';

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get([STORAGE_KEYS.SETTINGS]);
  return (result[STORAGE_KEYS.SETTINGS] as Settings | undefined) ?? DEFAULT_SETTINGS;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
}

export async function getWhitelist(): Promise<string[]> {
  const result = await chrome.storage.local.get([STORAGE_KEYS.WHITELIST]);
  return (result[STORAGE_KEYS.WHITELIST] as string[] | undefined) ?? [];
}

export async function addToWhitelist(handle: string): Promise<void> {
  const list = await getWhitelist();
  if (!list.includes(handle)) {
    list.push(handle);
    await chrome.storage.local.set({ [STORAGE_KEYS.WHITELIST]: list });
  }
}

export async function removeFromWhitelist(handle: string): Promise<void> {
  const list = await getWhitelist();
  const filtered = list.filter((h) => h !== handle);
  await chrome.storage.local.set({ [STORAGE_KEYS.WHITELIST]: filtered });
}
```

```typescript
// src/features/settings/index.ts
export { getSettings, saveSettings, getWhitelist, addToWhitelist, removeFromWhitelist } from './storage';
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/features/settings/storage.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/settings/ tests/features/settings/
git commit -m "feat: add settings storage with whitelist management"
```

---

## Task 3: Badge Detection — API Parser

**Files:**
- Create: `src/features/badge-detection/api-parser.ts`
- Test: `tests/features/badge-detection/api-parser.test.ts`

**참고:** X GraphQL 응답 구조는 구현 시점에 실제 x.com 응답을 리서치하여 정확한 필드 경로를 확인할 것. 아래는 알려진 구조 기반 초안이며, 리서치 결과에 따라 필드 경로를 조정한다.

- [ ] **Step 1: Write API parser test**

```typescript
// tests/features/badge-detection/api-parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseBadgeInfo } from '@features/badge-detection/api-parser';

describe('parseBadgeInfo', () => {
  it('should detect Premium subscriber (fadak)', () => {
    const userData = {
      rest_id: '12345',
      is_blue_verified: true,
      legacy: { verified: false },
    };
    const result = parseBadgeInfo(userData);
    expect(result).toEqual({
      userId: '12345',
      isBluePremium: true,
      isLegacyVerified: false,
      isBusiness: false,
    });
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/features/badge-detection/api-parser.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement API parser**

```typescript
// src/features/badge-detection/api-parser.ts
import type { BadgeInfo } from '@shared/types';

interface XUserData {
  rest_id?: string;
  is_blue_verified?: boolean;
  verified_type?: string;
  legacy?: {
    verified?: boolean;
  };
}

export function parseBadgeInfo(userData: unknown): BadgeInfo | null {
  const data = userData as XUserData;
  if (!data?.rest_id || typeof data.is_blue_verified !== 'boolean') {
    return null;
  }

  if (!data.is_blue_verified) {
    return null;
  }

  const isBusiness = data.verified_type === 'Business';
  const isLegacyVerified = data.legacy?.verified === true;
  const isBluePremium = !isBusiness && !isLegacyVerified;

  return {
    userId: data.rest_id,
    isBluePremium,
    isLegacyVerified,
    isBusiness,
  };
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/features/badge-detection/api-parser.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/badge-detection/api-parser.ts tests/features/badge-detection/
git commit -m "feat: add GraphQL response parser for badge detection"
```

---

## Task 4: Badge Detection — Cache & SVG Fallback

**Files:**
- Create: `src/features/badge-detection/badge-cache.ts`
- Create: `src/features/badge-detection/svg-fallback.ts`
- Create: `src/features/badge-detection/index.ts`
- Test: `tests/features/badge-detection/badge-cache.test.ts`
- Test: `tests/features/badge-detection/svg-fallback.test.ts`

- [ ] **Step 1: Write badge cache test**

```typescript
// tests/features/badge-detection/badge-cache.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { BadgeCache } from '@features/badge-detection/badge-cache';

describe('BadgeCache', () => {
  let cache: BadgeCache;

  beforeEach(() => {
    cache = new BadgeCache();
  });

  it('should return undefined for unknown user', () => {
    expect(cache.get('unknown')).toBeUndefined();
  });

  it('should store and retrieve badge status', () => {
    cache.set('12345', true);
    expect(cache.get('12345')).toBe(true);
  });

  it('should return false for non-fadak user', () => {
    cache.set('67890', false);
    expect(cache.get('67890')).toBe(false);
  });

  it('should check if user is cached', () => {
    expect(cache.has('12345')).toBe(false);
    cache.set('12345', true);
    expect(cache.has('12345')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/features/badge-detection/badge-cache.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement badge cache**

```typescript
// src/features/badge-detection/badge-cache.ts
export class BadgeCache {
  private cache = new Map<string, boolean>();

  get(userId: string): boolean | undefined {
    return this.cache.get(userId);
  }

  set(userId: string, isFadak: boolean): void {
    this.cache.set(userId, isFadak);
  }

  has(userId: string): boolean {
    return this.cache.has(userId);
  }
}
```

- [ ] **Step 4: Run cache tests**

```bash
npx vitest run tests/features/badge-detection/badge-cache.test.ts
```

Expected: PASS

- [ ] **Step 5: Write SVG fallback test**

```typescript
// tests/features/badge-detection/svg-fallback.test.ts
import { describe, it, expect } from 'vitest';
import { detectBadgeSvg } from '@features/badge-detection/svg-fallback';

describe('detectBadgeSvg', () => {
  it('should detect blue badge SVG in tweet element', () => {
    const el = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('data-testid', 'icon-verified');
    el.appendChild(svg);

    const result = detectBadgeSvg(el);
    expect(result).toBe(true);
  });

  it('should return false when no badge SVG', () => {
    const el = document.createElement('div');
    el.innerHTML = '<span>no badge</span>';

    const result = detectBadgeSvg(el);
    expect(result).toBe(false);
  });
});
```

**참고:** 실제 X DOM 구조에서 뱃지 SVG의 정확한 셀렉터(data-testid, 클래스명 등)는 구현 시점에 리서치가 필요하다. 위 테스트는 기본 구조이며, 리서치 결과에 따라 셀렉터를 조정한다.

- [ ] **Step 6: Implement SVG fallback**

```typescript
// src/features/badge-detection/svg-fallback.ts
const BLUE_BADGE_SELECTOR = '[data-testid="icon-verified"]';

export function detectBadgeSvg(tweetElement: Element): boolean {
  const badge = tweetElement.querySelector(BLUE_BADGE_SELECTOR);
  return badge !== null;
}
```

- [ ] **Step 7: Run SVG fallback tests**

```bash
npx vitest run tests/features/badge-detection/svg-fallback.test.ts
```

Expected: PASS

- [ ] **Step 8: Create badge-detection index**

```typescript
// src/features/badge-detection/index.ts
export { parseBadgeInfo } from './api-parser';
export { BadgeCache } from './badge-cache';
export { detectBadgeSvg } from './svg-fallback';
```

- [ ] **Step 9: Commit**

```bash
git add src/features/badge-detection/ tests/features/badge-detection/
git commit -m "feat: add badge cache and SVG fallback detection"
```

---

## Task 5: Content Filter — Tweet Processor

**Files:**
- Create: `src/features/content-filter/tweet-processor.ts`
- Test: `tests/features/content-filter/tweet-processor.test.ts`

트윗 처리 파이프라인의 핵심 판정 로직. DOM 조작 없이 "이 트윗을 숨길지 여부"만 결정한다.

- [ ] **Step 1: Write tweet processor test**

```typescript
// tests/features/content-filter/tweet-processor.test.ts
import { describe, it, expect } from 'vitest';
import { shouldHideTweet } from '@features/content-filter/tweet-processor';
import type { Settings } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/constants';

const baseContext = {
  settings: DEFAULT_SETTINGS,
  followList: new Set<string>(),
  whitelist: new Set<string>(),
  isFadak: true,
  userId: '12345',
  handle: '@fadakuser',
  pageType: 'timeline' as const,
};

describe('shouldHideTweet', () => {
  it('should hide fadak tweet on timeline', () => {
    expect(shouldHideTweet(baseContext)).toBe(true);
  });

  it('should not hide when extension is disabled', () => {
    const ctx = { ...baseContext, settings: { ...DEFAULT_SETTINGS, enabled: false } };
    expect(shouldHideTweet(ctx)).toBe(false);
  });

  it('should not hide when user is in follow list', () => {
    const ctx = { ...baseContext, followList: new Set(['12345']) };
    expect(shouldHideTweet(ctx)).toBe(false);
  });

  it('should not hide when user is in whitelist', () => {
    const ctx = { ...baseContext, whitelist: new Set(['@fadakuser']) };
    expect(shouldHideTweet(ctx)).toBe(false);
  });

  it('should not hide non-fadak user', () => {
    const ctx = { ...baseContext, isFadak: false };
    expect(shouldHideTweet(ctx)).toBe(false);
  });

  it('should not hide when timeline filter is off', () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      filter: { ...DEFAULT_SETTINGS.filter, timeline: false },
    };
    const ctx = { ...baseContext, settings };
    expect(shouldHideTweet(ctx)).toBe(false);
  });

  it('should respect replies filter setting', () => {
    const ctx = { ...baseContext, pageType: 'replies' as const };
    expect(shouldHideTweet(ctx)).toBe(true);

    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      filter: { ...DEFAULT_SETTINGS.filter, replies: false },
    };
    expect(shouldHideTweet({ ...ctx, settings })).toBe(false);
  });

  it('should respect search filter setting', () => {
    const ctx = { ...baseContext, pageType: 'search' as const };
    expect(shouldHideTweet(ctx)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/features/content-filter/tweet-processor.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement tweet processor**

```typescript
// src/features/content-filter/tweet-processor.ts
import type { Settings } from '@shared/types';

export type PageType = 'timeline' | 'replies' | 'search';

export interface TweetContext {
  settings: Settings;
  followList: Set<string>;
  whitelist: Set<string>;
  isFadak: boolean;
  userId: string;
  handle: string;
  pageType: PageType;
}

export function shouldHideTweet(ctx: TweetContext): boolean {
  if (!ctx.settings.enabled) return false;
  if (!ctx.isFadak) return false;
  if (ctx.followList.has(ctx.userId)) return false;
  if (ctx.whitelist.has(ctx.handle)) return false;

  const filterMap: Record<PageType, boolean> = {
    timeline: ctx.settings.filter.timeline,
    replies: ctx.settings.filter.replies,
    search: ctx.settings.filter.search,
  };

  return filterMap[ctx.pageType] ?? false;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/features/content-filter/tweet-processor.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/content-filter/ tests/features/content-filter/
git commit -m "feat: add tweet processor with filtering logic"
```

---

## Task 6: Content Filter — Tweet Hider

**Files:**
- Create: `src/features/content-filter/tweet-hider.ts`
- Test: `tests/features/content-filter/tweet-hider.test.ts`

DOM에 숨김 처리를 적용하는 모듈. `remove` (display:none) 과 `collapse` (접힌 상태 + 클릭 펼침) 두 모드를 지원한다.

- [ ] **Step 1: Write tweet hider test**

```typescript
// tests/features/content-filter/tweet-hider.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { hideTweet, showTweet } from '@features/content-filter/tweet-hider';

describe('hideTweet', () => {
  let tweetEl: HTMLElement;

  beforeEach(() => {
    tweetEl = document.createElement('article');
    tweetEl.textContent = 'original tweet content';
    document.body.appendChild(tweetEl);
  });

  it('should hide tweet with display:none in remove mode', () => {
    hideTweet(tweetEl, 'remove');
    expect(tweetEl.style.display).toBe('none');
  });

  it('should replace content with collapsed placeholder in collapse mode', () => {
    hideTweet(tweetEl, 'collapse');
    expect(tweetEl.style.display).not.toBe('none');
    const placeholder = tweetEl.querySelector('[data-bbr-collapsed]');
    expect(placeholder).not.toBeNull();
  });

  it('should restore tweet when showTweet is called', () => {
    hideTweet(tweetEl, 'remove');
    showTweet(tweetEl);
    expect(tweetEl.style.display).not.toBe('none');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/features/content-filter/tweet-hider.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement tweet hider**

```typescript
// src/features/content-filter/tweet-hider.ts
const ORIGINAL_CONTENT_KEY = 'data-bbr-original';
const COLLAPSED_ATTR = 'data-bbr-collapsed';

export function hideTweet(element: HTMLElement, mode: 'remove' | 'collapse'): void {
  if (mode === 'remove') {
    element.style.display = 'none';
    element.setAttribute(ORIGINAL_CONTENT_KEY, 'hidden');
    return;
  }

  element.setAttribute(ORIGINAL_CONTENT_KEY, 'collapsed');
  const originalChildren = Array.from(element.childNodes);
  originalChildren.forEach((child) => {
    if (child instanceof HTMLElement) {
      child.style.display = 'none';
    }
  });

  const placeholder = document.createElement('div');
  placeholder.setAttribute(COLLAPSED_ATTR, 'true');
  placeholder.textContent = '숨겨진 트윗 (클릭하여 펼치기)';
  placeholder.style.cssText = 'padding:12px;color:#71767b;cursor:pointer;text-align:center;';
  placeholder.addEventListener('click', () => showTweet(element), { once: true });
  element.appendChild(placeholder);
}

export function showTweet(element: HTMLElement): void {
  element.style.display = '';
  element.removeAttribute(ORIGINAL_CONTENT_KEY);

  const placeholder = element.querySelector(`[${COLLAPSED_ATTR}]`);
  placeholder?.remove();

  Array.from(element.childNodes).forEach((child) => {
    if (child instanceof HTMLElement) {
      child.style.display = '';
    }
  });
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/features/content-filter/tweet-hider.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/content-filter/tweet-hider.ts tests/features/content-filter/tweet-hider.test.ts
git commit -m "feat: add tweet hider with remove/collapse modes"
```

---

## Task 7: Content Filter — Observer & Integration

**Files:**
- Create: `src/features/content-filter/observer.ts`
- Create: `src/features/content-filter/index.ts`

MutationObserver 설정/해제 및 페이지 전환 감지. 이 모듈은 DOM에 강하게 결합되므로 단위 테스트보다 통합 테스트에서 검증한다.

- [ ] **Step 1: Implement observer**

```typescript
// src/features/content-filter/observer.ts
import { logger } from '@shared/utils/logger';

type TweetCallback = (tweetElement: HTMLElement) => void;

export class FeedObserver {
  private observer: MutationObserver | null = null;
  private onTweetAdded: TweetCallback;

  constructor(onTweetAdded: TweetCallback) {
    this.onTweetAdded = onTweetAdded;
  }

  observe(container: Element): void {
    this.disconnect();
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          const tweets = node.querySelectorAll('article[data-testid="tweet"]');
          tweets.forEach((tweet) => {
            try {
              this.onTweetAdded(tweet as HTMLElement);
            } catch (err) {
              logger.error('Error processing tweet', {
                error: err instanceof Error ? err.message : String(err),
              });
            }
          });
          if (node.matches?.('article[data-testid="tweet"]')) {
            try {
              this.onTweetAdded(node);
            } catch (err) {
              logger.error('Error processing tweet', {
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        }
      }
    });
    this.observer.observe(container, { childList: true, subtree: true });
    logger.info('FeedObserver started');
  }

  disconnect(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
      logger.info('FeedObserver disconnected');
    }
  }
}
```

**참고:** `article[data-testid="tweet"]` 셀렉터는 구현 시점에 실제 x.com DOM을 리서치하여 확인/조정한다.

- [ ] **Step 2: Create content-filter index**

```typescript
// src/features/content-filter/index.ts
export { shouldHideTweet, type TweetContext, type PageType } from './tweet-processor';
export { hideTweet, showTweet } from './tweet-hider';
export { FeedObserver } from './observer';
```

- [ ] **Step 3: Commit**

```bash
git add src/features/content-filter/
git commit -m "feat: add MutationObserver for feed monitoring"
```

---

## Task 8: Follow List — Token & Sync

**Files:**
- Create: `src/features/follow-list/follow-sync.ts`
- Create: `src/features/follow-list/index.ts`
- Test: `tests/features/follow-list/follow-sync.test.ts`

- [ ] **Step 1: Write follow sync test**

```typescript
// tests/features/follow-list/follow-sync.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchFollowList } from '@features/follow-list/follow-sync';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('fetchFollowList', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should return user IDs from API response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: {
          user: {
            result: {
              timeline: {
                timeline: {
                  instructions: [{
                    entries: [
                      {
                        content: {
                          itemContent: {
                            user_results: {
                              result: { rest_id: '111' },
                            },
                          },
                        },
                      },
                      {
                        content: {
                          itemContent: {
                            user_results: {
                              result: { rest_id: '222' },
                            },
                          },
                        },
                      },
                    ],
                  }],
                },
              },
            },
          },
        },
      }),
    });

    const result = await fetchFollowList('test-token', 'user123');
    expect(result).toContain('111');
    expect(result).toContain('222');
  });

  it('should throw on API error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(fetchFollowList('bad-token', 'user123')).rejects.toThrow();
  });
});
```

**참고:** X API의 팔로우 목록 엔드포인트와 응답 구조는 구현 시점에 리서치가 필요하다. 위 테스트는 알려진 GraphQL 구조 기반 초안이다.

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/features/follow-list/follow-sync.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement follow sync**

```typescript
// src/features/follow-list/follow-sync.ts
import { logger } from '@shared/utils/logger';

const FOLLOWING_ENDPOINT = 'https://api.x.com/graphql/';

export async function fetchFollowList(token: string, userId: string): Promise<string[]> {
  const response = await fetch(
    `${FOLLOWING_ENDPOINT}Following?variables=${encodeURIComponent(JSON.stringify({ userId, count: 200 }))}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-csrf-token': '',
      },
    },
  );

  if (!response.ok) {
    logger.error('Follow list fetch failed', { status: response.status });
    throw new Error(`Follow list API error: ${response.status}`);
  }

  const data = await response.json();
  const userIds: string[] = [];

  try {
    const instructions = data.data.user.result.timeline.timeline.instructions;
    for (const instruction of instructions) {
      const entries = instruction.entries ?? [];
      for (const entry of entries) {
        const restId = entry.content?.itemContent?.user_results?.result?.rest_id;
        if (typeof restId === 'string') {
          userIds.push(restId);
        }
      }
    }
  } catch {
    logger.warn('Unexpected follow list response structure');
  }

  return userIds;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/features/follow-list/follow-sync.test.ts
```

Expected: PASS

- [ ] **Step 5: Create follow-list index**

```typescript
// src/features/follow-list/index.ts
export { fetchFollowList } from './follow-sync';
```

- [ ] **Step 6: Commit**

```bash
git add src/features/follow-list/ tests/features/follow-list/
git commit -m "feat: add follow list sync via X API"
```

---

## Task 9: Fetch Interceptor (Injected Script)

**Files:**
- Create: `src/injected/fetch-interceptor.ts`

페이지 컨텍스트에 주입되어 `fetch`를 패치하고, API 응답에서 뱃지 데이터와 Bearer 토큰을 추출하여 `window.postMessage`로 Content Script에 전달한다.

- [ ] **Step 1: Implement fetch interceptor**

```typescript
// src/injected/fetch-interceptor.ts
import { MESSAGE_TYPES, X_GRAPHQL_ENDPOINTS } from '@shared/constants';

const originalFetch = window.fetch;

window.fetch = async function patchedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

  // Bearer 토큰 추출
  const authHeader = init?.headers instanceof Headers
    ? init.headers.get('authorization')
    : Array.isArray(init?.headers)
      ? init.headers.find(([k]) => k.toLowerCase() === 'authorization')?.[1]
      : (init?.headers as Record<string, string>)?.authorization
        ?? (init?.headers as Record<string, string>)?.Authorization;

  if (authHeader) {
    window.postMessage({
      type: MESSAGE_TYPES.TOKEN_DATA,
      token: authHeader.replace('Bearer ', ''),
    }, '*');
  }

  const response = await originalFetch.call(window, input, init);

  // GraphQL 응답 인터셉트
  const isGraphQL = X_GRAPHQL_ENDPOINTS.some((ep) => url.includes(ep));
  if (isGraphQL) {
    try {
      const cloned = response.clone();
      const data = await cloned.json();
      extractBadgeData(data);
    } catch {
      // 파싱 실패 시 무시 (폴백 모드가 처리)
    }
  }

  return response;
};

function extractBadgeData(data: unknown): void {
  const users: Array<{ rest_id: string; is_blue_verified: boolean; verified_type?: string; legacy?: { verified?: boolean } }> = [];
  findUserObjects(data, users);

  if (users.length > 0) {
    window.postMessage({
      type: MESSAGE_TYPES.BADGE_DATA,
      users,
    }, '*');
  }
}

function findUserObjects(obj: unknown, result: Array<unknown>): void {
  if (obj === null || typeof obj !== 'object') return;

  const record = obj as Record<string, unknown>;
  if ('rest_id' in record && 'is_blue_verified' in record) {
    result.push({
      rest_id: record.rest_id,
      is_blue_verified: record.is_blue_verified,
      verified_type: record.verified_type,
      legacy: record.legacy,
    });
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      value.forEach((item) => findUserObjects(item, result));
    } else if (typeof value === 'object') {
      findUserObjects(value, result);
    }
  }
}
```

**참고:** `@shared/constants` 임포트는 빌드 시 번들링된다. 이 파일은 페이지 컨텍스트에서 실행되므로 Chrome API 접근 불가.

- [ ] **Step 2: Commit**

```bash
git add src/injected/fetch-interceptor.ts
git commit -m "feat: add fetch interceptor for API response/token extraction"
```

---

## Task 10: Content Script Entry Point

**Files:**
- Modify: `src/content/index.ts`

Content Script 진입점. fetch interceptor 주입, postMessage 수신, MutationObserver 시작, 설정 로드를 조율한다.

- [ ] **Step 1: Implement content script**

```typescript
// src/content/index.ts
import { BadgeCache, parseBadgeInfo, detectBadgeSvg } from '@features/badge-detection';
import { FeedObserver, shouldHideTweet, hideTweet, type PageType } from '@features/content-filter';
import { getSettings, getWhitelist } from '@features/settings';
import { MESSAGE_TYPES, STORAGE_KEYS } from '@shared/constants';
import type { Settings } from '@shared/types';
import { logger } from '@shared/utils/logger';

const badgeCache = new BadgeCache();
let currentSettings: Settings;
let followSet = new Set<string>();
let whitelistSet = new Set<string>();
let feedObserver: FeedObserver;

async function init(): Promise<void> {
  currentSettings = await getSettings();

  const stored = await chrome.storage.local.get([STORAGE_KEYS.FOLLOW_LIST, STORAGE_KEYS.WHITELIST]);
  followSet = new Set(stored[STORAGE_KEYS.FOLLOW_LIST] as string[] ?? []);
  const whitelist = stored[STORAGE_KEYS.WHITELIST] as string[] ?? [];
  whitelistSet = new Set(whitelist);

  injectFetchInterceptor();
  listenForMessages();
  listenForSettingsChanges();

  feedObserver = new FeedObserver(processTweet);
  startObserving();
  listenForNavigation();

  logger.info('Blue Badge Remover initialized');
}

function injectFetchInterceptor(): void {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('src/injected/fetch-interceptor.ts');
  (document.head ?? document.documentElement).appendChild(script);
  script.onload = () => script.remove();
}

function listenForMessages(): void {
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    if (event.data?.type === MESSAGE_TYPES.BADGE_DATA) {
      for (const userData of event.data.users) {
        const badge = parseBadgeInfo(userData);
        if (badge) {
          badgeCache.set(badge.userId, badge.isBluePremium);
        }
      }
    }

    if (event.data?.type === MESSAGE_TYPES.TOKEN_DATA) {
      chrome.storage.local.set({ [STORAGE_KEYS.TOKEN]: event.data.token });
    }
  });
}

function listenForSettingsChanges(): void {
  chrome.storage.onChanged.addListener((changes) => {
    if (changes[STORAGE_KEYS.SETTINGS]) {
      currentSettings = changes[STORAGE_KEYS.SETTINGS].newValue as Settings;
    }
    if (changes[STORAGE_KEYS.FOLLOW_LIST]) {
      followSet = new Set(changes[STORAGE_KEYS.FOLLOW_LIST].newValue as string[]);
    }
    if (changes[STORAGE_KEYS.WHITELIST]) {
      whitelistSet = new Set(changes[STORAGE_KEYS.WHITELIST].newValue as string[]);
    }
  });
}

function getPageType(): PageType {
  const path = window.location.pathname;
  if (path.includes('/search')) return 'search';
  if (path.includes('/status/')) return 'replies';
  return 'timeline';
}

function processTweet(tweetEl: HTMLElement): void {
  const handleEl = tweetEl.querySelector('a[href^="/"]');
  const handle = handleEl?.getAttribute('href')?.slice(1);
  if (!handle) return;

  const userId = tweetEl.getAttribute('data-user-id') ?? handle;

  let isFadak = badgeCache.get(userId);
  if (isFadak === undefined) {
    isFadak = detectBadgeSvg(tweetEl);
    badgeCache.set(userId, isFadak);
  }

  const hide = shouldHideTweet({
    settings: currentSettings,
    followList: followSet,
    whitelist: whitelistSet,
    isFadak,
    userId,
    handle: `@${handle}`,
    pageType: getPageType(),
  });

  if (hide) {
    hideTweet(tweetEl, currentSettings.hideMode);
  }
}

function startObserving(): void {
  const feed = document.querySelector('main') ?? document.body;
  feedObserver.observe(feed);
}

function listenForNavigation(): void {
  const originalPushState = history.pushState;
  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    onNavigate();
  };
  window.addEventListener('popstate', onNavigate);
}

function onNavigate(): void {
  feedObserver.disconnect();
  requestAnimationFrame(() => startObserving());
}

init();
```

**참고:** 트윗에서 userId를 추출하는 방법(data-user-id, href 등)은 구현 시점에 실제 DOM 구조를 리서치하여 확인한다. 리트윗/인용 트윗 처리는 Task 12에서 추가한다.

- [ ] **Step 2: Commit**

```bash
git add src/content/index.ts
git commit -m "feat: implement content script entry point"
```

---

## Task 11: Service Worker & Popup UI

**Files:**
- Modify: `src/background/index.ts`
- Modify: `src/popup/index.html`
- Modify: `src/popup/index.ts`
- Modify: `src/popup/style.css`

- [ ] **Step 1: Implement service worker**

```typescript
// src/background/index.ts
import { STORAGE_KEYS } from '@shared/constants';
import { logger } from '@shared/utils/logger';

chrome.runtime.onInstalled.addListener(async () => {
  logger.info('Blue Badge Remover installed');
  await syncFollowList();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SYNC_FOLLOW_LIST') {
    syncFollowList().then(() => sendResponse({ success: true })).catch((err) => {
      logger.error('Follow sync failed', { error: String(err) });
      sendResponse({ success: false, error: String(err) });
    });
    return true;
  }
});

async function syncFollowList(): Promise<void> {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.TOKEN, STORAGE_KEYS.CURRENT_USER_ID]);
  const token = stored[STORAGE_KEYS.TOKEN] as string | null;
  const userId = stored[STORAGE_KEYS.CURRENT_USER_ID] as string | null;

  if (!token || !userId) {
    logger.warn('Cannot sync: no token or userId');
    return;
  }

  const { fetchFollowList } = await import('@features/follow-list/follow-sync');
  const followIds = await fetchFollowList(token, userId);
  await chrome.storage.local.set({
    [STORAGE_KEYS.FOLLOW_LIST]: followIds,
    [STORAGE_KEYS.LAST_SYNC_AT]: new Date().toISOString(),
  });
  logger.info('Follow list synced', { count: followIds.length });
}
```

- [ ] **Step 2: Implement popup HTML**

```html
<!-- src/popup/index.html -->
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="style.css">
  <title>Blue Badge Remover</title>
</head>
<body>
  <div class="container">
    <h1>Blue Badge Remover</h1>

    <div class="section">
      <label class="toggle-row">
        <span>마스터 ON/OFF</span>
        <input type="checkbox" id="enabled" checked>
      </label>
    </div>

    <div class="section">
      <h2>필터링 범위</h2>
      <label class="toggle-row"><span>타임라인</span><input type="checkbox" id="filter-timeline" checked></label>
      <label class="toggle-row"><span>답글</span><input type="checkbox" id="filter-replies" checked></label>
      <label class="toggle-row"><span>검색</span><input type="checkbox" id="filter-search" checked></label>
    </div>

    <div class="section">
      <h2>숨김 방식</h2>
      <label class="radio-row"><input type="radio" name="hideMode" value="remove" checked><span>완전 제거</span></label>
      <label class="radio-row"><input type="radio" name="hideMode" value="collapse"><span>접힌 상태로 표시</span></label>
    </div>

    <div class="section">
      <h2>리트윗</h2>
      <label class="toggle-row"><span>파딱 리트윗 숨김</span><input type="checkbox" id="retweetFilter" checked></label>
    </div>

    <div class="section">
      <h2>인용 트윗</h2>
      <label class="radio-row"><input type="radio" name="quoteMode" value="off" checked><span>필터링 안 함</span></label>
      <label class="radio-row"><input type="radio" name="quoteMode" value="quote-only"><span>인용 부분만 숨김</span></label>
      <label class="radio-row"><input type="radio" name="quoteMode" value="entire"><span>트윗 전체 숨김</span></label>
    </div>

    <div class="section">
      <h2>팔로우 동기화</h2>
      <p id="sync-status">마지막 동기화: -</p>
      <button id="sync-btn">🔄 동기화</button>
    </div>

    <div class="section">
      <h2>화이트리스트</h2>
      <div id="whitelist-container"></div>
      <div class="add-row">
        <input type="text" id="whitelist-input" placeholder="@핸들">
        <button id="whitelist-add">추가</button>
      </div>
    </div>
  </div>

  <script type="module" src="index.ts"></script>
</body>
</html>
```

- [ ] **Step 3: Implement popup script**

```typescript
// src/popup/index.ts
import { getSettings, saveSettings, getWhitelist, addToWhitelist, removeFromWhitelist } from '@features/settings';
import { STORAGE_KEYS } from '@shared/constants';
import type { Settings } from '@shared/types';

let settings: Settings;

async function init(): Promise<void> {
  settings = await getSettings();
  renderSettings();
  renderWhitelist();
  renderSyncStatus();
  bindEvents();
}

function renderSettings(): void {
  (document.getElementById('enabled') as HTMLInputElement).checked = settings.enabled;
  (document.getElementById('filter-timeline') as HTMLInputElement).checked = settings.filter.timeline;
  (document.getElementById('filter-replies') as HTMLInputElement).checked = settings.filter.replies;
  (document.getElementById('filter-search') as HTMLInputElement).checked = settings.filter.search;
  (document.getElementById('retweetFilter') as HTMLInputElement).checked = settings.retweetFilter;

  const hideModeRadio = document.querySelector(`input[name="hideMode"][value="${settings.hideMode}"]`) as HTMLInputElement;
  if (hideModeRadio) hideModeRadio.checked = true;

  const quoteModeRadio = document.querySelector(`input[name="quoteMode"][value="${settings.quoteMode}"]`) as HTMLInputElement;
  if (quoteModeRadio) quoteModeRadio.checked = true;
}

async function renderWhitelist(): Promise<void> {
  const container = document.getElementById('whitelist-container')!;
  const list = await getWhitelist();
  container.innerHTML = list
    .map((handle) => `<div class="whitelist-item"><span>${handle}</span><button data-handle="${handle}">✕</button></div>`)
    .join('');

  container.querySelectorAll('button[data-handle]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const handle = btn.getAttribute('data-handle')!;
      await removeFromWhitelist(handle);
      await renderWhitelist();
    });
  });
}

async function renderSyncStatus(): Promise<void> {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.LAST_SYNC_AT]);
  const lastSync = stored[STORAGE_KEYS.LAST_SYNC_AT] as string | null;
  document.getElementById('sync-status')!.textContent =
    `마지막 동기화: ${lastSync ? new Date(lastSync).toLocaleString('ko-KR') : '-'}`;
}

function bindEvents(): void {
  const save = async (): Promise<void> => {
    settings.enabled = (document.getElementById('enabled') as HTMLInputElement).checked;
    settings.filter.timeline = (document.getElementById('filter-timeline') as HTMLInputElement).checked;
    settings.filter.replies = (document.getElementById('filter-replies') as HTMLInputElement).checked;
    settings.filter.search = (document.getElementById('filter-search') as HTMLInputElement).checked;
    settings.retweetFilter = (document.getElementById('retweetFilter') as HTMLInputElement).checked;
    settings.hideMode = (document.querySelector('input[name="hideMode"]:checked') as HTMLInputElement).value as Settings['hideMode'];
    settings.quoteMode = (document.querySelector('input[name="quoteMode"]:checked') as HTMLInputElement).value as Settings['quoteMode'];
    await saveSettings(settings);
  };

  document.querySelectorAll('input').forEach((input) => {
    input.addEventListener('change', save);
  });

  document.getElementById('sync-btn')!.addEventListener('click', async () => {
    const btn = document.getElementById('sync-btn') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = '동기화 중...';
    try {
      await chrome.runtime.sendMessage({ type: 'SYNC_FOLLOW_LIST' });
      await renderSyncStatus();
    } finally {
      btn.disabled = false;
      btn.textContent = '🔄 동기화';
    }
  });

  document.getElementById('whitelist-add')!.addEventListener('click', async () => {
    const input = document.getElementById('whitelist-input') as HTMLInputElement;
    const handle = input.value.trim();
    if (!handle) return;
    const normalized = handle.startsWith('@') ? handle : `@${handle}`;
    await addToWhitelist(normalized);
    input.value = '';
    await renderWhitelist();
  });
}

init();
```

- [ ] **Step 4: Create popup CSS**

```css
/* src/popup/style.css */
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  width: 320px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
  color: #e7e9ea;
  background: #15202b;
}

.container { padding: 16px; }

h1 {
  font-size: 18px;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid #38444d;
}

h2 {
  font-size: 13px;
  color: #71767b;
  margin-bottom: 8px;
  text-transform: uppercase;
}

.section {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #38444d;
}

.toggle-row, .radio-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  cursor: pointer;
}

.radio-row { justify-content: flex-start; gap: 8px; }

button {
  background: #1d9bf0;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 20px;
  cursor: pointer;
  font-size: 14px;
}

button:hover { background: #1a8cd8; }
button:disabled { background: #38444d; cursor: not-allowed; }

input[type="text"] {
  background: #273340;
  border: 1px solid #38444d;
  color: #e7e9ea;
  padding: 8px;
  border-radius: 4px;
  flex: 1;
}

.add-row { display: flex; gap: 8px; margin-top: 8px; }

.whitelist-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
}

.whitelist-item button {
  background: none;
  color: #71767b;
  padding: 4px 8px;
  font-size: 16px;
}

.whitelist-item button:hover { color: #f4212e; }

#sync-status { color: #71767b; margin-bottom: 8px; }
```

- [ ] **Step 5: Commit**

```bash
git add src/background/ src/popup/
git commit -m "feat: add service worker and popup UI"
```

---

## Task 12: Retweet & Quote Tweet Filtering

**Files:**
- Modify: `src/features/content-filter/tweet-processor.ts`
- Modify: `tests/features/content-filter/tweet-processor.test.ts`
- Modify: `src/content/index.ts`

리트윗 및 인용 트윗 처리 로직을 추가한다.

- [ ] **Step 1: Add retweet/quote tweet tests**

`tweet-processor.test.ts`에 다음 테스트를 추가:

```typescript
describe('shouldHideRetweet', () => {
  it('should hide retweet of fadak when retweetFilter is on', () => {
    const ctx = {
      settings: { ...DEFAULT_SETTINGS, retweetFilter: true },
      isFadak: true,
      isRetweet: true,
    };
    expect(shouldHideRetweet(ctx)).toBe(true);
  });

  it('should not hide retweet when retweetFilter is off', () => {
    const ctx = {
      settings: { ...DEFAULT_SETTINGS, retweetFilter: false },
      isFadak: true,
      isRetweet: true,
    };
    expect(shouldHideRetweet(ctx)).toBe(false);
  });

  it('should not hide retweet of non-fadak', () => {
    const ctx = {
      settings: DEFAULT_SETTINGS,
      isFadak: false,
      isRetweet: true,
    };
    expect(shouldHideRetweet(ctx)).toBe(false);
  });
});

describe('getQuoteAction', () => {
  it('should return off when quoteMode is off', () => {
    expect(getQuoteAction({ ...DEFAULT_SETTINGS, quoteMode: 'off' }, true)).toBe('none');
  });

  it('should return quote-only when quoteMode is quote-only and quote is fadak', () => {
    expect(getQuoteAction({ ...DEFAULT_SETTINGS, quoteMode: 'quote-only' }, true)).toBe('hide-quote');
  });

  it('should return entire when quoteMode is entire and quote is fadak', () => {
    expect(getQuoteAction({ ...DEFAULT_SETTINGS, quoteMode: 'entire' }, true)).toBe('hide-entire');
  });

  it('should return none when quoted user is not fadak', () => {
    expect(getQuoteAction({ ...DEFAULT_SETTINGS, quoteMode: 'entire' }, false)).toBe('none');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/features/content-filter/tweet-processor.test.ts
```

Expected: FAIL — `shouldHideRetweet` and `getQuoteAction` not defined

- [ ] **Step 3: Implement retweet/quote logic**

`tweet-processor.ts`에 추가:

```typescript
export interface RetweetContext {
  settings: Settings;
  isFadak: boolean;
  isRetweet: boolean;
}

export function shouldHideRetweet(ctx: RetweetContext): boolean {
  if (!ctx.isRetweet || !ctx.isFadak) return false;
  return ctx.settings.retweetFilter;
}

export type QuoteAction = 'none' | 'hide-quote' | 'hide-entire';

export function getQuoteAction(settings: Settings, isQuotedUserFadak: boolean): QuoteAction {
  if (!isQuotedUserFadak || settings.quoteMode === 'off') return 'none';
  return settings.quoteMode === 'quote-only' ? 'hide-quote' : 'hide-entire';
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/features/content-filter/tweet-processor.test.ts
```

Expected: PASS

- [ ] **Step 5: Update content script**

`src/content/index.ts`의 `processTweet` 함수에 리트윗/인용 트윗 처리를 추가한다:
- 리트윗 감지: "Retweeted" 텍스트 또는 관련 DOM 요소 확인
- 인용 블록 감지: 트윗 내부의 인용 컨테이너 확인
- `shouldHideRetweet`, `getQuoteAction` 호출하여 적절히 숨김 처리

**참고:** 리트윗/인용 트윗의 DOM 구조는 구현 시점에 실제 x.com을 리서치하여 확인한다.

- [ ] **Step 6: Commit**

```bash
git add src/features/content-filter/ tests/features/content-filter/ src/content/
git commit -m "feat: add retweet and quote tweet filtering"
```

---

## Task 13: Account Switch Detection

**Files:**
- Modify: `src/content/index.ts`
- Modify: `src/background/index.ts`

API 응답에서 현재 로그인된 사용자 ID를 추출하고, 변경 감지 시 팔로우 목록을 재동기화한다.

- [ ] **Step 1: Add user ID extraction to fetch interceptor**

`src/injected/fetch-interceptor.ts`에서 현재 사용자 정보를 추출하여 `window.postMessage`로 전달하는 로직을 추가한다.

- [ ] **Step 2: Add user ID change detection to content script**

Content Script에서 `CURRENT_USER_ID` 변경을 감지하면 Service Worker에 `SYNC_FOLLOW_LIST` 메시지를 보낸다.

- [ ] **Step 3: Update service worker**

팔로우 목록 동기화 시 새 사용자 ID를 사용하도록 한다. 동기화 완료 전까지 기존 팔로우 목록을 유지한다.

- [ ] **Step 4: Commit**

```bash
git add src/content/ src/background/ src/injected/
git commit -m "feat: detect account switch and re-sync follow list"
```

---

## Task 14: End-to-End Verification & Polish

**Files:**
- All source files (minor adjustments)

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: ALL PASS

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 3: Build extension**

```bash
npx vite build
```

Expected: 빌드 성공, `dist/` 생성

- [ ] **Step 4: Manual test in Chrome**

1. `chrome://extensions` → 개발자 모드 → `dist/` 로드
2. x.com 접속, 타임라인에서 파딱 뱃지 트윗이 숨겨지는지 확인
3. Popup에서 토글 on/off 동작 확인
4. 화이트리스트 추가/삭제 확인
5. 팔로우 동기화 버튼 동작 확인

- [ ] **Step 5: Fix any issues found**

수동 테스트에서 발견된 문제를 수정한다.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "fix: polish and verify end-to-end"
```

---

## Summary

| Task | 내용 | 핵심 파일 |
|------|------|----------|
| 0 | Project Bootstrap | package.json, tsconfig, vite.config, manifest |
| 1 | Shared Types & Logger | shared/types, constants, logger |
| 2 | Settings Storage | features/settings/storage.ts |
| 3 | Badge Detection — API Parser | features/badge-detection/api-parser.ts |
| 4 | Badge Detection — Cache & SVG | features/badge-detection/badge-cache.ts, svg-fallback.ts |
| 5 | Content Filter — Tweet Processor | features/content-filter/tweet-processor.ts |
| 6 | Content Filter — Tweet Hider | features/content-filter/tweet-hider.ts |
| 7 | Content Filter — Observer | features/content-filter/observer.ts |
| 8 | Follow List — Sync | features/follow-list/follow-sync.ts |
| 9 | Fetch Interceptor | injected/fetch-interceptor.ts |
| 10 | Content Script Entry Point | content/index.ts |
| 11 | Service Worker & Popup UI | background/index.ts, popup/* |
| 12 | Retweet & Quote Tweet | tweet-processor.ts 확장 |
| 13 | Account Switch Detection | content + background 수정 |
| 14 | E2E Verification | 전체 빌드/테스트/수동 검증 |
