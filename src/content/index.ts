// src/content/index.ts
import { BadgeCache, parseBadgeInfo, detectBadgeSvg } from '@features/badge-detection';
import { FeedObserver, shouldHideTweet, shouldHideRetweet, getQuoteAction, hideTweet, hideQuoteBlock, setTweetHiderLanguage, type PageType } from '@features/content-filter';
import { getSettings, getWhitelist } from '@features/settings';
import { MESSAGE_TYPES, STORAGE_KEYS } from '@shared/constants';
import type { Settings } from '@shared/types';
import { logger } from '@shared/utils/logger';

const badgeCache = new BadgeCache();
let currentSettings: Settings;
let followSet = new Set<string>(); // lowercase handle 기반
let whitelistSet = new Set<string>(); // @handle 형식
let feedObserver: FeedObserver;

async function init(): Promise<void> {
  currentSettings = await getSettings();

  const stored = await chrome.storage.local.get([STORAGE_KEYS.FOLLOW_LIST, STORAGE_KEYS.WHITELIST, STORAGE_KEYS.FOLLOW_CACHE, STORAGE_KEYS.CURRENT_USER_ID]);
  // 계정별 캐시에서 팔로우 목록 로드
  const currentAccount = (stored[STORAGE_KEYS.CURRENT_USER_ID] as string | null) ?? '';
  const cache = (stored[STORAGE_KEYS.FOLLOW_CACHE] as Record<string, string[]> | undefined) ?? {};
  const cachedFollows = currentAccount ? (cache[currentAccount] ?? []) : ((stored[STORAGE_KEYS.FOLLOW_LIST] as string[] | undefined) ?? []);
  followSet = new Set(cachedFollows);
  const whitelist = (stored[STORAGE_KEYS.WHITELIST] as string[] | undefined) ?? [];
  whitelistSet = new Set(whitelist);

  setTweetHiderLanguage(currentSettings.language);
  setDebugFlag(currentSettings.debugMode);
  injectFetchInterceptor();
  listenForMessages();
  listenForSettingsChanges();

  feedObserver = new FeedObserver(processTweet);
  startObserving();
  listenForNavigation();
  collectFollowsFromDOM();
  // 프로필 링크가 렌더링된 후 계정 전환 감지
  setTimeout(() => detectAndHandleAccountSwitch(), 3000);

  if (currentSettings.debugMode) {
    const allStorage = await chrome.storage.local.get(null);
    console.log('[BBR STORAGE]', JSON.stringify({
      followCount: ((allStorage['followList'] as string[]) ?? []).length,
      whitelistCount: ((allStorage['whitelist'] as string[]) ?? []).length,
      token: allStorage['token'] ? 'SET' : 'UNSET',
      lastSyncAt: allStorage['lastSyncAt'],
    }));
  }
  if (currentSettings.debugMode) logger.info('Blue Badge Remover initialized');
}

function setDebugFlag(enabled: boolean): void {
  // 페이지 컨텍스트에 디버그 플래그 전달
  window.postMessage({ type: 'BBR_SET_DEBUG', enabled }, window.location.origin);
}

function injectFetchInterceptor(): void {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('fetch-interceptor.js');
  (document.head ?? document.documentElement).appendChild(script);
  script.onload = () => script.remove();
}

function listenForMessages(): void {
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;

    if (event.data?.type === MESSAGE_TYPES.BADGE_DATA) {
      for (const userData of event.data.users) {
        const badge = parseBadgeInfo(userData);
        if (badge) {
          badgeCache.set(badge.userId, badge.isBluePremium);
        }
      }
    }

    // TOKEN/CSRF는 저장하지 않음 (보안 정책 준수 — 메모리에서만 사용)

    if (event.data?.type === MESSAGE_TYPES.FOLLOW_DATA) {
      const handles = event.data.handles as string[];
      if (handles?.length) {
        saveFollowHandles(handles);
      }
    }

    // USER_ID는 DOM 기반 detectAndHandleAccountSwitch로 대체
  });
}

async function saveFollowHandles(handles: string[]): Promise<void> {
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
  followSet = new Set(merged);
  if (currentSettings.debugMode) logger.info('Follow handles saved', { account: currentAccount, newCount: handles.length, totalCount: merged.length });
}

function collectFollowsFromDOM(): void {
  // Following 페이지에서 DOM 기반으로 팔로우 핸들 수집
  if (!window.location.pathname.includes('/following')) return;

  const observer = new MutationObserver(() => {
    const handles: string[] = [];
    document.querySelectorAll('button[aria-label]').forEach((btn) => {
      const label = btn.getAttribute('aria-label') ?? '';
      const match = label.match(/팔로잉\s*@(\S+)/i) ?? label.match(/Following\s*@(\S+)/i);
      if (match?.[1]) {
        handles.push(match[1].toLowerCase());
      }
    });
    if (handles.length > 0) {
      saveFollowHandles(handles);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // 초기 수집
  setTimeout(() => {
    const handles: string[] = [];
    document.querySelectorAll('button[aria-label]').forEach((btn) => {
      const label = btn.getAttribute('aria-label') ?? '';
      const match = label.match(/팔로잉\s*@(\S+)/i) ?? label.match(/Following\s*@(\S+)/i);
      if (match?.[1]) {
        handles.push(match[1].toLowerCase());
      }
    });
    if (handles.length > 0) {
      saveFollowHandles(handles);
    }
  }, 2000);
}

async function detectAndHandleAccountSwitch(): Promise<void> {
  const profileLink = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
  if (!profileLink) return;
  const href = profileLink.getAttribute('href');
  if (!href) return;
  const currentHandle = href.slice(1).toLowerCase();
  if (!currentHandle) return;

  const stored = await chrome.storage.local.get([STORAGE_KEYS.CURRENT_USER_ID, STORAGE_KEYS.FOLLOW_CACHE]);
  const savedHandle = stored[STORAGE_KEYS.CURRENT_USER_ID] as string | null;

  if (savedHandle !== currentHandle) {
    // 계정 전환 또는 최초 설정: 캐시에서 해당 계정의 팔로우 목록 로드
    const cache = (stored[STORAGE_KEYS.FOLLOW_CACHE] as Record<string, string[]> | undefined) ?? {};
    const cachedFollows = cache[currentHandle] ?? [];
    await chrome.storage.local.set({
      [STORAGE_KEYS.CURRENT_USER_ID]: currentHandle,
      [STORAGE_KEYS.FOLLOW_LIST]: cachedFollows,
    });
    followSet = new Set(cachedFollows);
    if (currentSettings.debugMode) logger.info('Account switched', { from: savedHandle, to: currentHandle, cachedFollows: cachedFollows.length });
  }
}

function listenForSettingsChanges(): void {
  chrome.storage.onChanged.addListener((changes) => {
    const settingsChange = changes[STORAGE_KEYS.SETTINGS];
    if (settingsChange) {
      currentSettings = settingsChange.newValue as Settings;
      setTweetHiderLanguage(currentSettings.language);
    }
    const followChange = changes[STORAGE_KEYS.FOLLOW_LIST];
    if (followChange) {
      followSet = new Set(followChange.newValue as string[]);
    }
    const whitelistChange = changes[STORAGE_KEYS.WHITELIST];
    if (whitelistChange) {
      whitelistSet = new Set(whitelistChange.newValue as string[]);
    }
  });
}

function getPageType(): PageType {
  const path = window.location.pathname;
  if (path.includes('/search')) return 'search';
  if (path.includes('/status/')) return 'replies';
  return 'timeline';
}

function extractTweetAuthor(tweetEl: HTMLElement): { handle: string; userId: string } | null {
  // 리트윗 socialContext 링크(재게시함/Retweeted 텍스트 포함)를 건너뛰고 원본 작성자를 찾음
  const allLinks = tweetEl.querySelectorAll('a[role="link"][href^="/"]');
  for (const link of allLinks) {
    const text = link.textContent ?? '';
    // 리트윗한 사람의 링크 건너뜀 (재게시함/Retweeted 텍스트 포함)
    if (/재게시함|Retweeted|reposted/i.test(text)) continue;
    const href = link.getAttribute('href');
    if (!href) continue;
    const handle = href.slice(1).split('/')[0];
    // 내부 경로(status, photo, hashtag 등) 제외, 빈 핸들 제외
    if (!handle || handle === 'i' || handle === 'hashtag' || href.includes('/status/') || href.includes('/photo/')) continue;
    return { handle, userId: handle };
  }
  return null;
}

function extractRetweeterName(tweetEl: HTMLElement): string | null {
  const socialContext = tweetEl.querySelector('[data-testid="socialContext"]');
  if (!socialContext) return null;
  // socialContext 내부에서 리트윗한 사람의 링크를 찾음
  const link = socialContext.querySelector('a[href^="/"]');
  if (link) {
    return link.textContent?.trim() ?? null;
  }
  // 링크가 없으면 텍스트에서 추출
  const text = socialContext.textContent ?? '';
  return text.replace(/\s*(Retweeted|reposted|님이\s*재게시함|님이\s*리트윗함|님이\s*리포스트함|님이\s*리트윗.*|님이\s*리포스트.*).*/i, '').trim() || null;
}

function findQuoteBlock(tweetEl: HTMLElement): HTMLElement | null {
  // X DOM: 인용 트윗은 "인용"/"Quote" 텍스트 뒤에 link로 감싼 트윗 블록
  // data-testid="quoteTweet"는 없음
  const allNodes = tweetEl.querySelectorAll('div, span');
  for (const node of allNodes) {
    if (node.childNodes.length === 1 && node.textContent?.trim() === '인용') {
      // "인용" 텍스트의 다음 형제가 인용 블록
      const next = node.nextElementSibling as HTMLElement | null;
      if (next) return next;
    }
  }
  // 영어 fallback
  for (const node of allNodes) {
    if (node.childNodes.length === 1 && node.textContent?.trim() === 'Quote') {
      const next = node.nextElementSibling as HTMLElement | null;
      if (next) return next;
    }
  }
  return null;
}

interface QuoteAuthorInfo {
  handle: string;
  displayName: string | null;
}

function extractQuoteAuthor(quoteBlock: HTMLElement): QuoteAuthorInfo | null {
  const text = quoteBlock.textContent ?? '';
  // 텍스트 패턴: "닉네임@handle·시간" 또는 "닉네임 @handle · 시간"
  const match = text.match(/^(.+?)@([A-Za-z0-9_]+)/);
  if (match?.[1] && match[2]) {
    return {
      handle: match[2].toLowerCase(),
      displayName: match[1].trim() || null,
    };
  }
  // 링크에서 찾기 (fallback)
  const links = quoteBlock.querySelectorAll('a[href^="/"]');
  for (const link of links) {
    const linkText = link.textContent ?? '';
    if (linkText.startsWith('@')) {
      return { handle: linkText.slice(1).toLowerCase(), displayName: null };
    }
  }
  for (const link of links) {
    const href = link.getAttribute('href') ?? '';
    const handle = href.slice(1).split('/')[0];
    if (handle && !href.includes('/status/') && !href.includes('/photo/')) {
      return { handle: handle.toLowerCase(), displayName: null };
    }
  }
  return null;
}

function extractDisplayName(tweetEl: HTMLElement, handle: string): string | null {
  // 트윗에서 작성자의 표시 이름(닉네임) 추출
  const links = tweetEl.querySelectorAll('a[role="link"]');
  for (const link of links) {
    const href = link.getAttribute('href') ?? '';
    if (href === `/${handle}` && !link.textContent?.startsWith('@')) {
      const name = link.textContent?.trim();
      if (name && !/재게시함|Retweeted|reposted/i.test(name)) {
        // "닉네임 비공개 계정" 등에서 "비공개 계정" 부분 제거
        return name.replace(/\s*(비공개 계정|인증된 계정)$/g, '').trim() || null;
      }
    }
  }
  return null;
}

function formatUserLabel(handle: string, displayName: string | null): string {
  return displayName ? `${displayName}(@${handle})` : `@${handle}`;
}

function isHandleFollowed(handle: string): boolean {
  return followSet.has(handle.toLowerCase());
}

function checkFadak(userId: string, element: HTMLElement): boolean {
  let isFadak = badgeCache.get(userId);
  if (isFadak === undefined) {
    isFadak = detectBadgeSvg(element);
    badgeCache.set(userId, isFadak);
  }
  return isFadak;
}

function processTweet(tweetEl: HTMLElement): void {
  const author = extractTweetAuthor(tweetEl);
  if (!author) return;

  const { handle, userId } = author;
  const isFadak = checkFadak(userId, tweetEl);
  const displayName = extractDisplayName(tweetEl, handle);
  const userLabel = formatUserLabel(handle, displayName);

  // 리트윗 감지: socialContext 존재 여부로 판단
  const socialContext = tweetEl.querySelector('[data-testid="socialContext"]');
  const isRetweet = socialContext !== null;

  const inFollow = isHandleFollowed(handle);

  if (currentSettings.debugMode) {
    const hasQuote = !!findQuoteBlock(tweetEl);
    addDebugLabel(tweetEl, {
      handle: `@${handle}`,
      isFadak,
      isRetweet,
      hasQuote,
      inFollow,
      retweeter: isRetweet ? (extractRetweeterName(tweetEl) ?? '?') : undefined,
    });
    console.log('[BBR]', userLabel, { isFadak, isRetweet, inFollow, hasQuote });
  }

  if (isRetweet) {
    // 리트윗인 경우: 표시된 작성자가 원본 작성자
    // socialContext에 리트윗한 사람의 이름이 있음
    const retweeterName = extractRetweeterName(tweetEl) ?? '';

    // 원본 작성자(author)가 파딱이면 숨김
    const originalIsFadak = isFadak;

    if (originalIsFadak) {
      // 팔로우/화이트리스트 체크 (원본 작성자 기준)
      if (isHandleFollowed(handle) || whitelistSet.has(`@${handle}`)) {
        return; // 예외 — 숨기지 않음
      }

      const hideRetweet = shouldHideRetweet({
        settings: currentSettings,
        isFadak: true,
        isRetweet: true,
      });
      if (hideRetweet) {
        hideTweet(tweetEl, currentSettings.hideMode, {
          reason: 'retweet',
          handle: `@${handle}`,
          retweetedBy: retweeterName || undefined,
        });
        return;
      }
    }
    // 리트윗이지만 원본이 파딱 아님 → 통과
    return;
  }

  // 1순위: 직접 트윗 — 작성자가 파딱인가?
  if (isFadak && !inFollow) {
    const hide = shouldHideTweet({
      settings: currentSettings,
      followList: new Set<string>(), // follow 체크는 위에서 이미 함
      whitelist: whitelistSet,
      isFadak: true,
      userId,
      handle: `@${handle}`,
      pageType: getPageType(),
    });

    if (hide) {
      hideTweet(tweetEl, currentSettings.hideMode, {
        reason: 'fadak',
        handle: `@${handle}`,
      });
      return;
    }
  }

  // 3순위: 인용 트윗 — 인용된 계정이 파딱인가?
  // X DOM에서 인용은 data-testid="quoteTweet"가 아닌, "인용" 텍스트 + link 구조
  const quoteBlock = findQuoteBlock(tweetEl);
  if (quoteBlock) {
    const quoteAuthor = extractQuoteAuthor(quoteBlock);
    const quotedHandle = quoteAuthor?.handle ?? null;
    const quotedName = quoteAuthor?.displayName ?? null;
    const quotedLabel = quotedName ? `${quotedName}(@${quotedHandle})` : `@${quotedHandle ?? ''}`;

    let quotedIsFadak = false;
    if (quotedHandle) {
      quotedIsFadak = checkFadak(quotedHandle, quoteBlock);
    } else {
      quotedIsFadak = detectBadgeSvg(quoteBlock);
    }

    if (quotedIsFadak && !isHandleFollowed(quotedHandle ?? '') && !whitelistSet.has(`@${quotedHandle ?? ''}`)) {
      const quoteAction = getQuoteAction(currentSettings, true);
      if (quoteAction === 'hide-entire') {
        hideTweet(tweetEl, currentSettings.hideMode, {
          reason: 'quote-entire',
          handle: `@${quotedHandle ?? ''}`,
          quotedBy: userLabel,
        });
        return;
      }
      if (quoteAction === 'hide-quote') {
        hideQuoteBlock(quoteBlock, { handle: `@${quotedHandle ?? ''}` });
        return;
      }
    }
  }
}

function startObserving(): void {
  const feed = document.querySelector('main') ?? document.body;
  feedObserver.observe(feed);
}

function listenForNavigation(): void {
  const originalPushState = history.pushState;
  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    originalPushState.apply(this, args);
    onNavigate();
  };
  window.addEventListener('popstate', onNavigate);
}

function onNavigate(): void {
  feedObserver.disconnect();
  requestAnimationFrame(() => {
    startObserving();
    // 뒤로가기 시 기존 DOM에 이미 있는 트윗을 재처리
    reprocessExistingTweets();
  });
}

function reprocessExistingTweets(): void {
  const feed = document.querySelector('main') ?? document.body;
  const tweets = feed.querySelectorAll('article[data-testid="tweet"]');
  tweets.forEach((tweet) => {
    // 이미 처리된 트윗(디버그 라벨 있음)은 건너뜀
    if (tweet.querySelector('[data-bbr-debug]')) return;
    try {
      processTweet(tweet as HTMLElement);
    } catch {
      // 개별 트윗 에러 무시
    }
  });
}

interface DebugInfo {
  handle: string;
  isFadak: boolean;
  isRetweet: boolean;
  hasQuote: boolean;
  inFollow: boolean;
  retweeter?: string;
}

function addDebugLabel(tweetEl: HTMLElement, info: DebugInfo): void {
  if (tweetEl.querySelector('[data-bbr-debug]')) return;
  const parts: string[] = [];
  parts.push(info.handle);
  if (info.isFadak) parts.push('FADAK');
  if (info.inFollow) parts.push('FOLLOW');
  if (info.isRetweet) parts.push(`RT by ${info.retweeter ?? '?'}`);
  if (info.hasQuote) parts.push('QUOTE');

  const color = info.isFadak ? (info.inFollow ? '#00ba7c' : '#f4212e') : '#71767b';
  const label = document.createElement('div');
  label.setAttribute('data-bbr-debug', 'true');
  label.textContent = `[BBR] ${parts.join(' | ')}`;
  label.style.cssText = `font-size:10px;color:${color};padding:2px 8px;background:rgba(0,0,0,0.6);border-radius:4px;position:relative;z-index:10;`;
  tweetEl.prepend(label);
}

if (typeof document !== 'undefined') {
  init();
}
