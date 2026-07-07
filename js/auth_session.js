import * as TokenModule from './token.js?v=20260707-1';

export const AUTH_TOKEN_KEY = TokenModule.AUTH_TOKEN_KEY || 'auth_token';
export const AUTH_PROFILE_KEY = TokenModule.AUTH_PROFILE_KEY || 'auth_profile';

function getSessionStorage() {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return null;
  }

  return window.sessionStorage;
}

function getLegacyStorage() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  return window.localStorage;
}

function clearStoredAuthState() {
  const sessionStorageRef = getSessionStorage();
  const legacyStorageRef = getLegacyStorage();

  if (sessionStorageRef) {
    sessionStorageRef.removeItem(AUTH_TOKEN_KEY);
    sessionStorageRef.removeItem(AUTH_PROFILE_KEY);
    sessionStorageRef.removeItem('admin_token');
  }

  if (legacyStorageRef) {
    legacyStorageRef.removeItem(AUTH_TOKEN_KEY);
    legacyStorageRef.removeItem(AUTH_PROFILE_KEY);
    legacyStorageRef.removeItem('admin_token');
  }
}

function readStoredProfile() {
  const storages = [getSessionStorage(), getLegacyStorage()].filter(Boolean);
  for (const storage of storages) {
    const raw = storage.getItem(AUTH_PROFILE_KEY);
    if (!raw) {
      continue;
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      console.warn('Failed to parse auth profile:', error);
      storage.removeItem(AUTH_PROFILE_KEY);
    }
  }

  return null;
}

export function setAuthToken(token) {
  if (typeof TokenModule.setAuthToken === 'function') {
    TokenModule.setAuthToken(token);
    return;
  }

  if (typeof TokenModule.setAdminToken === 'function') {
    TokenModule.setAdminToken(token);
    return;
  }

  const sessionStorageRef = getSessionStorage();
  const legacyStorageRef = getLegacyStorage();
  if (sessionStorageRef) {
    sessionStorageRef.setItem(AUTH_TOKEN_KEY, token);
    sessionStorageRef.removeItem('admin_token');
  }
  if (legacyStorageRef) {
    legacyStorageRef.removeItem(AUTH_TOKEN_KEY);
    legacyStorageRef.removeItem('admin_token');
  }
}

export function getAuthToken() {
  if (typeof TokenModule.getAuthToken === 'function') {
    return TokenModule.getAuthToken();
  }

  if (typeof TokenModule.getAdminToken === 'function') {
    return TokenModule.getAdminToken();
  }

  const sessionStorageRef = getSessionStorage();
  if (sessionStorageRef) {
    const token = sessionStorageRef.getItem(AUTH_TOKEN_KEY) || sessionStorageRef.getItem('admin_token');
    if (token) {
      return token;
    }
  }

  const legacyStorageRef = getLegacyStorage();
  if (!legacyStorageRef) {
    return null;
  }

  return legacyStorageRef.getItem(AUTH_TOKEN_KEY) || legacyStorageRef.getItem('admin_token');
}

export function setAuthProfile(profile) {
  if (typeof TokenModule.setAuthProfile === 'function') {
    TokenModule.setAuthProfile(profile);
    return;
  }

  const sessionStorageRef = getSessionStorage();
  if (!sessionStorageRef) {
    return;
  }

  sessionStorageRef.setItem(AUTH_PROFILE_KEY, JSON.stringify(profile || {}));
}

export function getAuthProfile() {
  if (typeof TokenModule.getAuthProfile === 'function') {
    return TokenModule.getAuthProfile();
  }

  return readStoredProfile();
}

export function clearAuthSession() {
  if (typeof TokenModule.clearAuthSession === 'function') {
    TokenModule.clearAuthSession();
  } else if (typeof TokenModule.clearAdminToken === 'function') {
    TokenModule.clearAdminToken();
  } else if (typeof TokenModule.clearComputerAccess === 'function') {
    TokenModule.clearComputerAccess();
  }

  clearStoredAuthState();
}

export function hasCapability(capability, profile = getAuthProfile()) {
  if (typeof TokenModule.hasCapability === 'function') {
    return TokenModule.hasCapability(capability, profile);
  }

  if (!capability || !profile || !Array.isArray(profile.capabilities)) {
    return false;
  }

  return profile.capabilities.includes(capability);
}

export function hasAllCapabilities(capabilities, profile = getAuthProfile()) {
  if (typeof TokenModule.hasAllCapabilities === 'function') {
    return TokenModule.hasAllCapabilities(capabilities, profile);
  }

  if (!Array.isArray(capabilities) || capabilities.length === 0) {
    return true;
  }

  return capabilities.every((capability) => hasCapability(capability, profile));
}

export function setAdminToken(token) {
  setAuthToken(token);
}

export function getAdminToken() {
  return getAuthToken();
}

export function clearAdminToken() {
  clearAuthSession();
}
