// tests/features/content-filter/tweet-hider.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { hideTweet, hideQuoteBlock, showTweet } from '@features/content-filter/tweet-hider';

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

  it('should not hide already hidden tweet', () => {
    hideTweet(tweetEl, 'collapse');
    const firstPlaceholder = tweetEl.querySelector('[data-bbr-collapsed]');
    hideTweet(tweetEl, 'collapse');
    const placeholders = tweetEl.querySelectorAll('[data-bbr-collapsed]');
    expect(placeholders.length).toBe(1);
    expect(firstPlaceholder).toBe(placeholders[0]);
  });

  it('should show fadak context in collapse mode', () => {
    hideTweet(tweetEl, 'collapse', { reason: 'fadak', handle: '@fadakuser' });
    const placeholder = tweetEl.querySelector('[data-bbr-collapsed]');
    expect(placeholder?.textContent).toContain('@fadakuser');
    expect(placeholder?.textContent).toContain('파딱');
  });

  it('should show retweet context in collapse mode', () => {
    hideTweet(tweetEl, 'collapse', { reason: 'retweet', handle: '@fadakuser', retweetedBy: '내 팔로우' });
    const placeholder = tweetEl.querySelector('[data-bbr-collapsed]');
    expect(placeholder?.textContent).toContain('내 팔로우');
    expect(placeholder?.textContent).toContain('@fadakuser');
    expect(placeholder?.textContent).toContain('리트윗');
  });

  it('should show quote-entire context in collapse mode', () => {
    hideTweet(tweetEl, 'collapse', { reason: 'quote-entire', handle: '@fadakuser' });
    const placeholder = tweetEl.querySelector('[data-bbr-collapsed]');
    expect(placeholder?.textContent).toContain('@fadakuser');
    expect(placeholder?.textContent).toContain('인용');
  });
});

describe('hideQuoteBlock', () => {
  it('should hide quote block and show context', () => {
    const quoteEl = document.createElement('div');
    quoteEl.textContent = 'quoted content';
    document.body.appendChild(quoteEl);

    hideQuoteBlock(quoteEl, { handle: '@fadakuser' });
    const placeholder = quoteEl.querySelector('[data-bbr-collapsed]');
    expect(placeholder).not.toBeNull();
    expect(placeholder?.textContent).toContain('@fadakuser');
    expect(placeholder?.textContent).toContain('인용 트윗이 숨겨졌습니다');
  });

  it('should not hide already hidden quote block', () => {
    const quoteEl = document.createElement('div');
    quoteEl.textContent = 'quoted content';
    hideQuoteBlock(quoteEl, { handle: '@a' });
    hideQuoteBlock(quoteEl, { handle: '@b' });
    const placeholders = quoteEl.querySelectorAll('[data-bbr-collapsed]');
    expect(placeholders.length).toBe(1);
  });
});
