# Privacy Policy — Blue Badge Remover

**Last updated:** 2026-03-29

## Overview

Blue Badge Remover is a Chrome extension that hides paid blue badge (Premium) accounts on X (Twitter). This policy explains how the extension handles user data.

## Data Collection

**Blue Badge Remover does not collect, transmit, or share any personal data.**

All processing happens entirely within your browser. No data is sent to external servers, analytics services, or third parties.

## Data Stored Locally

The extension stores the following data in `chrome.storage.local` (your browser only):

| Data | Purpose | Shared? |
|------|---------|---------|
| Extension settings | Filtering preferences, hide mode, language | No |
| Follow list (handles) | Exempting followed accounts from filtering | No |
| Whitelist (handles) | Exempting manually added accounts | No |
| Current account handle | Switching follow lists between accounts | No |

This data never leaves your browser and is not accessible to any external service.

## Data NOT Collected

- No authentication tokens or credentials are stored
- No browsing history is tracked
- No tweet content is collected or logged
- No personal information is transmitted
- No analytics or telemetry data is gathered
- No cookies are read or modified

## How the Extension Works

The extension operates by:

1. Intercepting X's internal API responses (within the browser) to identify paid badge accounts
2. Monitoring the page DOM to detect and hide tweets from those accounts
3. Reading the follow list from X's Following page API response to build an exemption list

All of this happens locally in your browser. The extension only communicates with X's own servers through the normal page requests that X already makes.

## Permissions

| Permission | Justification |
|------------|---------------|
| `storage` | Save settings, follow list, and whitelist locally |
| `host_permissions: x.com` | Content script injection and API response interception on X |
| `host_permissions: api.x.com` | Required for follow list API response interception |

## Third-Party Services

Blue Badge Remover does not use any third-party services, SDKs, or external APIs.

## Changes to This Policy

Any changes to this privacy policy will be reflected in the extension update notes and this document.

## Contact

For questions about this privacy policy, contact [@fotoner_p on X](https://x.com/fotoner_p).
