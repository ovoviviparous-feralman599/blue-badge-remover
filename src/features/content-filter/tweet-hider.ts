// src/features/content-filter/tweet-hider.ts
import { t, type Language, DEFAULT_LANGUAGE } from '@shared/i18n';

const ORIGINAL_CONTENT_KEY = 'data-bbr-original';
const COLLAPSED_ATTR = 'data-bbr-collapsed';
const HIDDEN_QUOTE_ATTR = 'data-bbr-hidden-quote';

let currentLanguage: Language = DEFAULT_LANGUAGE;

export function setTweetHiderLanguage(lang: Language): void {
  currentLanguage = lang;
}

export interface HideContext {
  reason: 'fadak' | 'retweet' | 'quote-entire';
  handle?: string;
  retweetedBy?: string;
  quotedBy?: string;
}

export interface HideQuoteContext {
  handle?: string;
}

export function hideTweet(element: HTMLElement, mode: 'remove' | 'collapse', context?: HideContext): void {
  if (element.hasAttribute(ORIGINAL_CONTENT_KEY)) return;

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

  const label = buildHideLabel(context);
  const placeholder = document.createElement('div');
  placeholder.setAttribute(COLLAPSED_ATTR, 'true');
  placeholder.textContent = label;
  placeholder.style.cssText = 'padding:12px;color:#71767b;cursor:pointer;text-align:center;font-size:13px;';
  placeholder.addEventListener('click', () => showTweet(element), { once: true });
  element.appendChild(placeholder);
}

export function hideQuoteBlock(quoteElement: HTMLElement, context?: HideQuoteContext): void {
  if (quoteElement.hasAttribute(HIDDEN_QUOTE_ATTR)) return;

  quoteElement.setAttribute(HIDDEN_QUOTE_ATTR, 'true');
  const originalChildren = Array.from(quoteElement.childNodes);
  originalChildren.forEach((child) => {
    if (child instanceof HTMLElement) {
      child.style.display = 'none';
    }
  });

  const handle = context?.handle ?? '';
  const placeholder = document.createElement('div');
  placeholder.setAttribute(COLLAPSED_ATTR, 'true');
  placeholder.textContent = t('hiddenQuoteTweet', currentLanguage, { handle });
  placeholder.style.cssText = 'padding:8px 12px;color:#71767b;cursor:pointer;text-align:center;font-size:12px;';
  placeholder.addEventListener('click', () => showQuoteBlock(quoteElement), { once: true });
  quoteElement.appendChild(placeholder);
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

function showQuoteBlock(element: HTMLElement): void {
  element.removeAttribute(HIDDEN_QUOTE_ATTR);

  const placeholder = element.querySelector(`[${COLLAPSED_ATTR}]`);
  placeholder?.remove();

  Array.from(element.childNodes).forEach((child) => {
    if (child instanceof HTMLElement) {
      child.style.display = '';
    }
  });
}

function buildHideLabel(context?: HideContext): string {
  if (!context) return t('hiddenTweetClick', currentLanguage);

  switch (context.reason) {
    case 'fadak':
      return t('hiddenTweetFadak', currentLanguage, { handle: context.handle ?? '' });
    case 'retweet':
      return t('hiddenTweetRetweet', currentLanguage, {
        retweetedBy: context.retweetedBy ?? '',
        handle: context.handle ?? '',
      });
    case 'quote-entire':
      return t('hiddenTweetQuoteEntire', currentLanguage, {
        quotedBy: context.quotedBy ?? '',
        handle: context.handle ?? '',
      });
    default:
      return t('hiddenTweetClick', currentLanguage);
  }
}
