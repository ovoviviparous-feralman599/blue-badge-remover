// src/content/follow-collector.ts
import { STORAGE_KEYS } from '@shared/constants';
import type { Settings } from '@shared/types';
import { logger } from '@shared/utils/logger';

export interface FollowCollectorDeps {
  getCurrentSettings: () => Settings;
  setFollowSet: (set: Set<string>) => void;
  getFollowSet?: () => Set<string>;
  onFollowed?: (handle: string) => void;
  onUnfollowed?: (handle: string) => void;
}

let followObserver: MutationObserver | null = null;

export function getMyHandle(): string | null {
  const profileLink = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
  const href = profileLink?.getAttribute('href');
  return href ? href.slice(1).toLowerCase() : null;
}

export async function saveFollowHandles(
  handles: string[],
  deps: FollowCollectorDeps,
): Promise<void> {
  if (!handles.length) return;
  const stored = await chrome.storage.local.get([STORAGE_KEYS.FOLLOW_CACHE, STORAGE_KEYS.CURRENT_USER_ID]);
  const currentAccount = (stored[STORAGE_KEYS.CURRENT_USER_ID] as string | null) ?? '';
  const cache = (stored[STORAGE_KEYS.FOLLOW_CACHE] as Record<string, string[]> | undefined) ?? {};
  const existing = currentAccount ? (cache[currentAccount] ?? []) : [];
  const merged = [...new Set([...existing, ...handles])];
  if (currentAccount) {
    cache[currentAccount] = merged;
  }
  await chrome.storage.local.set({
    [STORAGE_KEYS.FOLLOW_CACHE]: cache,
    [STORAGE_KEYS.FOLLOW_LIST]: merged,
    [STORAGE_KEYS.LAST_SYNC_AT]: new Date().toISOString(),
  });
  deps.setFollowSet(new Set(merged));
  const settings = deps.getCurrentSettings();
  if (settings.debugMode) logger.info('Follow handles saved', { account: currentAccount, newCount: handles.length, totalCount: merged.length });
}

export async function removeFollowHandle(
  handle: string,
  deps: FollowCollectorDeps,
): Promise<void> {
  const lower = handle.toLowerCase();
  const stored = await chrome.storage.local.get([STORAGE_KEYS.FOLLOW_CACHE, STORAGE_KEYS.CURRENT_USER_ID]);
  const currentAccount = (stored[STORAGE_KEYS.CURRENT_USER_ID] as string | null) ?? '';
  const cache = (stored[STORAGE_KEYS.FOLLOW_CACHE] as Record<string, string[]> | undefined) ?? {};
  const existing = currentAccount ? (cache[currentAccount] ?? []) : [];
  const filtered = existing.filter((h) => h !== lower);
  if (currentAccount) {
    cache[currentAccount] = filtered;
  }
  await chrome.storage.local.set({
    [STORAGE_KEYS.FOLLOW_CACHE]: cache,
    [STORAGE_KEYS.FOLLOW_LIST]: filtered,
  });
  deps.setFollowSet(new Set(filtered));
  const settings = deps.getCurrentSettings();
  if (settings.debugMode) logger.info('Follow handle removed', { handle: lower, totalCount: filtered.length });
}

function extractHandlesFromDOM(): string[] {
  const handles: string[] = [];
  document.querySelectorAll('button[aria-label]').forEach((btn) => {
    const label = btn.getAttribute('aria-label') ?? '';
    const match = label.match(/팔로잉\s*@(\S+)/i) ?? label.match(/Following\s*@(\S+)/i);
    if (match?.[1]) {
      handles.push(match[1].toLowerCase());
    }
  });
  return handles;
}

export function collectFollowsFromDOM(deps: FollowCollectorDeps): void {
  // Only collect from Following page, and only for my own following list
  if (!window.location.pathname.includes('/following')) return;
  const myHandle = getMyHandle();
  if (!myHandle) return;
  const pathUser = window.location.pathname.split('/')[1]?.toLowerCase();
  if (pathUser && pathUser !== myHandle) return;

  disconnectFollowObserver();

  followObserver = new MutationObserver(() => {
    const handles = extractHandlesFromDOM();
    if (handles.length > 0) {
      void saveFollowHandles(handles, deps);
    }
  });

  followObserver.observe(document.body, { childList: true, subtree: true });

  // Initial collection
  setTimeout(() => {
    const handles = extractHandlesFromDOM();
    if (handles.length > 0) {
      void saveFollowHandles(handles, deps);
    }
  }, 2000);
}

export function disconnectFollowObserver(): void {
  if (followObserver) {
    followObserver.disconnect();
    followObserver = null;
  }
}

export function listenForFollowButtonClicks(deps: FollowCollectorDeps): void {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const button = target.closest('button[aria-label]');
    if (!button) return;
    const label = button.getAttribute('aria-label') ?? '';
    const followSet = deps.getFollowSet?.() ?? new Set<string>();

    // 팔로우: "팔로우 @handle" / "Follow @handle"
    const followMatch = label.match(/^(?:팔로우|Follow)\s+@(\S+)$/i);
    if (followMatch?.[1]) {
      const handle = followMatch[1].toLowerCase();
      if (!followSet.has(handle)) {
        followSet.add(handle);
        void saveFollowHandles([handle], deps);
        deps.onFollowed?.(handle);
      }
      return;
    }

    // 언팔: "팔로잉 @handle" / "Following @handle"
    const unfollowMatch = label.match(/^(?:팔로잉|Following)\s+@(\S+)$/i);
    if (unfollowMatch?.[1]) {
      const handle = unfollowMatch[1].toLowerCase();
      setTimeout(() => {
        const updatedLabel = button.getAttribute('aria-label') ?? '';
        if (/^(?:팔로우|Follow)\s+@/i.test(updatedLabel)) {
          followSet.delete(handle);
          void removeFollowHandle(handle, deps);
          deps.onUnfollowed?.(handle);
        }
      }, 2000);
    }
  }, true);
}
