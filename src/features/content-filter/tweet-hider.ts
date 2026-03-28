// src/features/content-filter/tweet-hider.ts
const ORIGINAL_CONTENT_KEY = 'data-bbr-original';
const COLLAPSED_ATTR = 'data-bbr-collapsed';
const HIDDEN_QUOTE_ATTR = 'data-bbr-hidden-quote';

export interface HideContext {
  reason: 'fadak' | 'retweet' | 'quote-entire';
  handle?: string;
  retweetedBy?: string;
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
  placeholder.style.cssText = 'padding:12px;color:#71767b;cursor:pointer;text-align:center;font-size:13px;border:1px solid #38444d;border-radius:12px;margin:4px 0;';
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

  const handle = context?.handle ?? '알 수 없음';
  const placeholder = document.createElement('div');
  placeholder.setAttribute(COLLAPSED_ATTR, 'true');
  placeholder.textContent = `파딱 계정(${handle})의 인용 트윗이 숨겨졌습니다 (클릭하여 펼치기)`;
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
  if (!context) return '숨겨진 트윗 (클릭하여 펼치기)';

  switch (context.reason) {
    case 'fadak':
      return `파딱 계정(${context.handle ?? ''})의 트윗이 숨겨졌습니다 (클릭하여 펼치기)`;
    case 'retweet':
      return `${context.retweetedBy ?? ''}님이 파딱 계정(${context.handle ?? ''})의 트윗을 리트윗했습니다 (클릭하여 펼치기)`;
    case 'quote-entire':
      return `파딱 계정(${context.handle ?? ''})의 인용이 포함된 트윗이 숨겨졌습니다 (클릭하여 펼치기)`;
    default:
      return '숨겨진 트윗 (클릭하여 펼치기)';
  }
}
