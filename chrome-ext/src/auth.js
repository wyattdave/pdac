// PDAC extension authentication.
//
// Auth code + PKCE against Entra ID using the well-known public client that
// pac CLI uses (localhost redirect is pre-registered on it). The interactive
// leg opens the authorize URL in a tab and captures the ?code= redirect to
// http://localhost:5500/ by reading the tab URL — nothing listens on that
// port. The token exchange and all refresh-token grants are direct fetch
// POSTs to the token endpoint: extensions with host_permissions for
// login.microsoftonline.com are exempt from CORS, which is what makes a
// browser-only PKCE + refresh-token flow possible at all.

export const DEFAULT_CLIENT_ID = '51f81489-12ee-4a9e-aaae-a2591f45987d';
export const DEFAULT_TENANT = 'organizations';
export const BAP_RESOURCE = 'https://service.powerapps.com';
export const POWER_PLATFORM_RESOURCE = 'https://api.powerplatform.com';

const REDIRECT_URI = 'http://localhost:5500/';
const AUTH_TIMEOUT_MS = 120000;

export class AuthRequiredError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function createPkcePair() {
  const verifier = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64UrlEncode(new Uint8Array(digest)) };
}

export function decodeJwtPayload(token) {
  const payload = String(token || '').split('.')[1] || '';
  const padded = payload.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
  try {
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))));
  } catch {
    return {};
  }
}

export function scopeFor(resource) {
  return `${String(resource).replace(/\/+$/, '')}/.default`;
}

async function tokenRequest(tenant, params) {
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error_description || body.error || `Token request failed with HTTP ${response.status}.`);
    error.oauthError = body.error || '';
    throw error;
  }
  return body;
}

// Opens the authorize URL in a tab and resolves with the full redirect URL
// once the tab reaches http://localhost:5500/. The tab is closed immediately,
// so the browser's connection-refused page is visible for a moment at most.
function waitForRedirect(authUrl, { active = true } = {}) {
  return new Promise((resolve, reject) => {
    let tabId = null;
    let settled = false;
    const finish = (fn, value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      if (tabId !== null) {
        chrome.tabs.remove(tabId).catch(() => {});
      }
      fn(value);
    };
    const timeout = setTimeout(() => finish(reject, new AuthRequiredError('Sign-in timed out after 2 minutes.')), AUTH_TIMEOUT_MS);
    function onUpdated(updatedTabId, changeInfo, tab) {
      if (updatedTabId !== tabId) {
        return;
      }
      const url = changeInfo.url || tab?.url || '';
      if (url.startsWith(REDIRECT_URI)) {
        finish(resolve, url);
      }
    }
    function onRemoved(removedTabId) {
      if (removedTabId === tabId) {
        tabId = null;
        finish(reject, new AuthRequiredError('The sign-in tab was closed before completing.'));
      }
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    chrome.tabs.create({ url: authUrl, active }).then((tab) => {
      tabId = tab.id;
    }, (error) => finish(reject, error));
  });
}

function parseRedirect(redirectUrl) {
  const params = new URL(redirectUrl).searchParams;
  if (params.get('error')) {
    const error = new AuthRequiredError(params.get('error_description') || params.get('error'));
    error.oauthError = params.get('error');
    throw error;
  }
  const code = params.get('code');
  if (!code) {
    throw new AuthRequiredError('The sign-in redirect did not include an authorization code.');
  }
  return { code, state: params.get('state') };
}

function accountFromTokenResponse(tokens, tenant) {
  const claims = decodeJwtPayload(tokens.id_token);
  const tenantId = claims.tid || tenant;
  return {
    homeAccountId: `${claims.oid || claims.sub || 'unknown'}.${tenantId}`,
    username: claims.preferred_username || claims.upn || claims.email || '',
    name: claims.name || claims.preferred_username || 'Unknown user',
    tenantId,
    refreshToken: tokens.refresh_token || null,
    updatedAt: new Date().toISOString(),
  };
}

async function authorize({ tenant, clientId, resource, prompt, loginHint, active }) {
  const pkce = await createPkcePair();
  const state = base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    response_mode: 'query',
    scope: `${scopeFor(resource)} openid profile offline_access`,
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
    state,
  });
  if (prompt) {
    params.set('prompt', prompt);
  }
  if (loginHint) {
    params.set('login_hint', loginHint);
  }
  const authUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize?${params}`;
  const redirect = parseRedirect(await waitForRedirect(authUrl, { active }));
  if (redirect.state !== state) {
    throw new AuthRequiredError('The sign-in response state did not match; discarding the result.');
  }
  const tokens = await tokenRequest(tenant, {
    client_id: clientId,
    grant_type: 'authorization_code',
    code: redirect.code,
    redirect_uri: REDIRECT_URI,
    code_verifier: pkce.verifier,
  });
  return {
    account: accountFromTokenResponse(tokens, tenant),
    accessToken: tokens.access_token,
    expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000,
    resource,
  };
}

// Interactive sign-in. prompt 'select_account' gives the account picker
// ("sign in with a different account"); omit for SSO fast-path.
export function signInInteractive({ tenant = DEFAULT_TENANT, clientId = DEFAULT_CLIENT_ID, resource = BAP_RESOURCE, selectAccount = false } = {}) {
  return authorize({ tenant, clientId, resource, prompt: selectAccount ? 'select_account' : undefined, active: true });
}

// Silent sign-in through SSO cookies / device PRT: prompt=none in a
// background tab. Succeeds without interaction on SSO devices; throws
// AuthRequiredError when Entra reports interaction is required.
export function signInSilent({ tenant = DEFAULT_TENANT, clientId = DEFAULT_CLIENT_ID, resource = BAP_RESOURCE, loginHint = '' } = {}) {
  return authorize({ tenant, clientId, resource, prompt: 'none', loginHint, active: false });
}

// Refresh-token grant for any resource audience (Entra refresh tokens are
// multi-resource for the same client). Returns the new rotating refresh
// token when one is issued — callers must persist it.
export async function refreshGrant({ tenant, clientId = DEFAULT_CLIENT_ID, refreshToken, resource }) {
  try {
    const tokens = await tokenRequest(tenant, {
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: `${scopeFor(resource)} openid profile offline_access`,
    });
    return {
      accessToken: tokens.access_token,
      expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000,
      refreshToken: tokens.refresh_token || null,
    };
  } catch (error) {
    if (error.oauthError === 'invalid_grant' || error.oauthError === 'interaction_required') {
      throw new AuthRequiredError(error.message);
    }
    throw error;
  }
}
