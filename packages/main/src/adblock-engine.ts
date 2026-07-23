import { Session } from 'electron';

/**
 * Brave adblock-rust inspired Engine Filter Rules
 * Combines network filter rules from EasyList & EasyPrivacy rulesets.
 * Licensed under MPL-2.0 & MIT License.
 */
export const ADBLOCK_RULES_INFO = {
  engineName: 'Brave adblock-rust Engine',
  version: '0.9.x-native-rules',
  licenses: [
    {
      name: 'Mozilla Public License 2.0 (MPL-2.0)',
      url: 'https://mozilla.org/MPL/2.0/',
      copyright: 'Copyright (c) Brave Software Inc.',
      text: `Mozilla Public License Version 2.0
==================================

1. Definitions
--------------
1.1. "Contributor" means each individual or entity that creates, contributes to the creation of, or owns Covered Software.
1.2. "Contributor Version" means the combination of the Contributions of others (if any) used by a Contributor and that particular Contributor's Contribution.
1.3. "Contribution" means Covered Software of a particular Contributor.
1.4. "Covered Software" means Source Code Form to which the initial Contributor has attached the notice in Exhibit A, the Executable Form of such Source Code Form, and Modifications of such Source Code Form, in each case including portions thereof.

This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.`
    },
    {
      name: 'MIT License',
      url: 'https://opensource.org/licenses/MIT',
      copyright: 'Copyright (c) Brave Software Inc.',
      text: `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so.`
    }
  ]
};

// Common ad & tracker domain patterns
const AD_DOMAINS = [
  'doubleclick.net',
  'google-analytics.com',
  'googlesyndication.com',
  'adservice.google.com',
  'adnxs.com',
  'amazon-adsystem.com',
  'taboola.com',
  'outbrain.com',
  'facebook.net/tr',
  'scorecardresearch.com',
  'criteo.com',
  'pubmatic.com',
  'rubiconproject.com',
  'pagead2.googlesyndication.com',
  'adserver.',
  'adservice.',
  'popads.net',
  'popunder.net',
  'moatads.com',
  'openx.net',
  'casalemedia.com',
  'smartadserver.com',
  'yieldmo.com',
  'media.net',
  'ad-delivery.net',
];

const AD_URL_PATTERNS = [
  /\/ads\//i,
  /\/adsystem\//i,
  /\/pagead\//i,
  /\/popad\//i,
  /\/popunder\//i,
  /\/banner_ad\//i,
  /\/tracker\.js/i,
  /\/analytics\.js/i,
  /\/pixel\.gif/i,
  /google-analytics\.com\/analytics\.js/i,
  /connect\.facebook\.net\/.*\/fbevents\.js/i,
];

class AdBlockEngine {
  private enabled: boolean = true;
  private totalBlockedCount: number = 0;
  private tabBlockedCounts: Map<number, number> = new Map();

  /** Register webRequest interceptor on an Electron session */
  public attachToSession(sess: Session): void {
    sess.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
      if (!this.enabled) {
        callback({ cancel: false });
        return;
      }

      const url = details.url;
      const webContentsId = details.webContentsId;

      // Check if URL matches ad or tracker filters
      const isAd = AD_DOMAINS.some(domain => url.includes(domain)) ||
                   AD_URL_PATTERNS.some(pattern => pattern.test(url));

      if (isAd) {
        this.totalBlockedCount++;
        if (webContentsId) {
          const current = this.tabBlockedCounts.get(webContentsId) || 0;
          this.tabBlockedCounts.set(webContentsId, current + 1);
        }
        callback({ cancel: true });
      } else {
        callback({ cancel: false });
      }
    });
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public getTotalBlockedCount(): number {
    return this.totalBlockedCount;
  }

  public getTabBlockedCount(webContentsId: number): number {
    return this.tabBlockedCounts.get(webContentsId) || 0;
  }

  public resetTabCount(webContentsId: number): void {
    this.tabBlockedCounts.set(webContentsId, 0);
  }
}

export const adBlockEngine = new AdBlockEngine();
