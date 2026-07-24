// Settings and account persistence (chrome.storage.local).
// IndexedDB stores for report data arrive in M2; auth/config state lives
// here because the service worker and app page both need cheap access.

import { DEFAULT_CLIENT_ID, DEFAULT_TENANT } from './auth.js';

const SETTINGS_KEY = 'pdac.settings';
const ACCOUNTS_KEY = 'pdac.accounts';
const SELECTED_KEY = 'pdac.selectedAccount';

async function getLocal(key, fallback) {
  const result = await chrome.storage.local.get(key);
  return result[key] ?? fallback;
}

function setLocal(key, value) {
  return chrome.storage.local.set({ [key]: value });
}

export async function getSettings() {
  const settings = await getLocal(SETTINGS_KEY, {});
  return {
    tenant: settings.tenant || DEFAULT_TENANT,
    clientId: settings.clientId || DEFAULT_CLIENT_ID,
    orgUrl: settings.orgUrl || '',
    selectedEnvironments: Array.isArray(settings.selectedEnvironments) ? settings.selectedEnvironments : [],
    solutionOptions: settings.solutionOptions || { includeManaged: false, includeMicrosoftOwned: false, excludedPublishers: '' },
  };
}

export async function saveSettings(update) {
  const settings = { ...(await getSettings()), ...update };
  await setLocal(SETTINGS_KEY, settings);
  return settings;
}

export function getAccounts() {
  return getLocal(ACCOUNTS_KEY, {});
}

export async function saveAccount(account) {
  const accounts = await getAccounts();
  const existing = accounts[account.homeAccountId] || {};
  accounts[account.homeAccountId] = {
    ...existing,
    ...account,
    // A silent flow can complete without issuing a new refresh token; never
    // overwrite a stored refresh token with null.
    refreshToken: account.refreshToken || existing.refreshToken || null,
  };
  await setLocal(ACCOUNTS_KEY, accounts);
  return accounts[account.homeAccountId];
}

export async function updateRefreshToken(homeAccountId, refreshToken) {
  if (!refreshToken) {
    return;
  }
  const accounts = await getAccounts();
  if (accounts[homeAccountId]) {
    accounts[homeAccountId].refreshToken = refreshToken;
    accounts[homeAccountId].updatedAt = new Date().toISOString();
    await setLocal(ACCOUNTS_KEY, accounts);
  }
}

export async function removeAccount(homeAccountId) {
  const accounts = await getAccounts();
  delete accounts[homeAccountId];
  await setLocal(ACCOUNTS_KEY, accounts);
  if ((await getSelectedAccountId()) === homeAccountId) {
    await setLocal(SELECTED_KEY, Object.keys(accounts)[0] || '');
  }
}

export function getSelectedAccountId() {
  return getLocal(SELECTED_KEY, '');
}

export function setSelectedAccountId(homeAccountId) {
  return setLocal(SELECTED_KEY, homeAccountId);
}

export async function getSelectedAccount() {
  const [accounts, selectedId] = await Promise.all([getAccounts(), getSelectedAccountId()]);
  return accounts[selectedId] || Object.values(accounts)[0] || null;
}
