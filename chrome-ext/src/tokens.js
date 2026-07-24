// Per-resource access-token cache on top of the refresh-token grant.
//
// Access tokens live in chrome.storage.session (memory-backed, cleared when
// the browser closes) so the app page and the service worker share one
// cache. Acquisition order: session cache → refresh-token grant →
// prompt=none silent sign-in → AuthRequiredError (caller shows the sign-in
// button).

import { AuthRequiredError, refreshGrant, signInSilent } from './auth.js';
import { getAccounts, getSelectedAccount, getSettings, saveAccount, updateRefreshToken } from './storage.js';

const CACHE_KEY = 'pdac.tokenCache';
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

async function readCache() {
  const result = await chrome.storage.session.get(CACHE_KEY);
  return result[CACHE_KEY] || {};
}

async function writeCacheEntry(key, entry) {
  const cache = await readCache();
  cache[key] = entry;
  await chrome.storage.session.set({ [CACHE_KEY]: cache });
}

export function clearTokenCache() {
  return chrome.storage.session.remove(CACHE_KEY);
}

export async function getAccessToken(resource) {
  const account = await getSelectedAccount();
  if (!account) {
    throw new AuthRequiredError('No account is signed in.');
  }
  return acquireForAccount(account, resource);
}

// Per-account token acquisition for the server-core port, which can be asked
// to act as any signed-in account via the X-PDAC-Account-Home-Id header.
export async function getAccessTokenForAccountId(resource, homeAccountId) {
  const accounts = await getAccounts();
  const account = accounts[homeAccountId];
  if (!account) {
    throw new AuthRequiredError('That account is no longer signed in.');
  }
  return acquireForAccount(account, resource);
}

async function acquireForAccount(account, resource) {
  const settings = await getSettings();
  const normalizedResource = String(resource).replace(/\/+$/, '');
  const cacheKey = `${account.homeAccountId}|${normalizedResource}`;
  const cache = await readCache();
  const cached = cache[cacheKey];
  if (cached && cached.expiresAt - EXPIRY_MARGIN_MS > Date.now()) {
    return cached.accessToken;
  }

  if (account.refreshToken) {
    try {
      const result = await refreshGrant({
        tenant: account.tenantId || settings.tenant,
        clientId: settings.clientId,
        refreshToken: account.refreshToken,
        resource: normalizedResource,
      });
      await updateRefreshToken(account.homeAccountId, result.refreshToken);
      await writeCacheEntry(cacheKey, { accessToken: result.accessToken, expiresAt: result.expiresAt });
      return result.accessToken;
    } catch (error) {
      if (!(error instanceof AuthRequiredError)) {
        throw error;
      }
      // Refresh token expired or revoked — fall through to SSO silent auth.
    }
  }

  const silent = await signInSilent({
    tenant: account.tenantId || settings.tenant,
    clientId: settings.clientId,
    resource: normalizedResource,
    loginHint: account.username,
  });
  await saveAccount(silent.account);
  await writeCacheEntry(cacheKey, { accessToken: silent.accessToken, expiresAt: silent.expiresAt });
  return silent.accessToken;
}
