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
  debugMode: boolean;
  language: 'ko' | 'en' | 'ja';
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
