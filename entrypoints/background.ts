// entrypoints/background.ts — WXT background service worker
import { browser } from 'wxt/browser';
import { logger } from '@shared/utils/logger';
import { MESSAGE_TYPES } from '@shared/constants';

export default defineBackground(() => {
  logger.info('Blue Badge Remover installed');

  const isFirefoxAndroid = navigator.userAgent.includes('Firefox') && navigator.userAgent.includes('Android');

  // MV2/MV3 호환: browser.action (MV3) 또는 browser.browserAction (MV2)
  const actionApi = browser.action ?? (browser as unknown as Record<string, unknown>).browserAction as typeof browser.action | undefined;

  // content script → 설정 페이지 열기 요청 처리
  browser.runtime.onMessage.addListener((message, sender) => {
    if ((message as Record<string, unknown>).type !== MESSAGE_TYPES.OPEN_SETTINGS) return;
    const settingsUrl = browser.runtime.getURL('/popup.html');
    if (isFirefoxAndroid && sender.tab?.id != null) {
      void browser.tabs.update(sender.tab.id, { url: settingsUrl });
    } else {
      void browser.tabs.create({ url: settingsUrl });
    }
  });

  // Firefox for Android: 팝업 대신 새 탭으로 열기
  // Firefox 모바일에서는 팝업 내 버튼 클릭 시 탭 이동이 비정상적으로 동작
  if (isFirefoxAndroid && actionApi) {
    actionApi.setPopup({ popup: '' });
    actionApi.onClicked.addListener(() => {
      void browser.tabs.create({ url: browser.runtime.getURL('/popup.html') });
    });
  }
});
