export const AUTH_TOKEN_KEY = "auth_token";
export const AUTH_PROFILE_KEY = "auth_profile";
export const ADMIN_TOKEN_KEY = AUTH_TOKEN_KEY;

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

export function setAuthToken(token) {
  const sessionStorageRef = getSessionStorage();
  const legacyStorageRef = getLegacyStorage();

  if (sessionStorageRef) {
    sessionStorageRef.setItem(AUTH_TOKEN_KEY, token);
    sessionStorageRef.removeItem("admin_token");
  }

  if (legacyStorageRef) {
    legacyStorageRef.removeItem(AUTH_TOKEN_KEY);
    legacyStorageRef.removeItem("admin_token");
  }
}

export function getAuthToken() {
  const sessionStorageRef = getSessionStorage();
  const legacyStorageRef = getLegacyStorage();

  if (sessionStorageRef) {
    const token = sessionStorageRef.getItem(AUTH_TOKEN_KEY) || sessionStorageRef.getItem("admin_token");
    if (token) {
      if (sessionStorageRef.getItem(AUTH_TOKEN_KEY) !== token) {
        sessionStorageRef.setItem(AUTH_TOKEN_KEY, token);
        sessionStorageRef.removeItem("admin_token");
      }
      return token;
    }
  }

  if (!legacyStorageRef) {
    return null;
  }

  const legacyToken = legacyStorageRef.getItem(AUTH_TOKEN_KEY) || legacyStorageRef.getItem("admin_token");
  if (!legacyToken) {
    return null;
  }

  if (sessionStorageRef) {
    sessionStorageRef.setItem(AUTH_TOKEN_KEY, legacyToken);
  }
  legacyStorageRef.removeItem(AUTH_TOKEN_KEY);
  legacyStorageRef.removeItem("admin_token");

  return legacyToken;
}

export function setAuthProfile(profile) {
  const sessionStorageRef = getSessionStorage();
  if (!sessionStorageRef) {
    return;
  }

  sessionStorageRef.setItem(AUTH_PROFILE_KEY, JSON.stringify(profile || {}));
}

export function getAuthProfile() {
  const sessionStorageRef = getSessionStorage();
  if (!sessionStorageRef) {
    return null;
  }

  const raw = sessionStorageRef.getItem(AUTH_PROFILE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn('Failed to parse auth profile:', error);
    sessionStorageRef.removeItem(AUTH_PROFILE_KEY);
    return null;
  }
}

export function clearAuthSession() {
  const sessionStorageRef = getSessionStorage();
  const legacyStorageRef = getLegacyStorage();

  if (sessionStorageRef) {
    sessionStorageRef.removeItem(AUTH_TOKEN_KEY);
    sessionStorageRef.removeItem(AUTH_PROFILE_KEY);
    sessionStorageRef.removeItem("admin_token");
  }

  if (legacyStorageRef) {
    legacyStorageRef.removeItem(AUTH_TOKEN_KEY);
    legacyStorageRef.removeItem(AUTH_PROFILE_KEY);
    legacyStorageRef.removeItem("admin_token");
  }
}

export function hasCapability(capability, profile = getAuthProfile()) {
  if (!capability || !profile || !Array.isArray(profile.capabilities)) {
    return false;
  }

  return profile.capabilities.includes(capability);
}

export function hasAllCapabilities(capabilities, profile = getAuthProfile()) {
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

export function setComputerAccess() {
  // Deprecated: route access is now derived from authenticated capabilities.
}

export function getComputerAccessGranted() {
  return hasCapability('computers.admin');
}

export function getComputerOperatorName() {
  return getAuthProfile()?.user_id || '';
}

export function clearComputerAccess() {
  clearAuthSession();
}
