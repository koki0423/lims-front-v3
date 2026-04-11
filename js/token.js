export const ADMIN_TOKEN_KEY = "admin_token";

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

export function setAdminToken(token) {
  const sessionStorageRef = getSessionStorage();
  const legacyStorageRef = getLegacyStorage();

  if (sessionStorageRef) {
    sessionStorageRef.setItem(ADMIN_TOKEN_KEY, token);
  }

  if (legacyStorageRef) {
    legacyStorageRef.removeItem(ADMIN_TOKEN_KEY);
  }
}

export function getAdminToken() {
  const sessionStorageRef = getSessionStorage();
  const legacyStorageRef = getLegacyStorage();

  if (sessionStorageRef) {
    const token = sessionStorageRef.getItem(ADMIN_TOKEN_KEY);
    if (token) {
      return token;
    }
  }

  if (!legacyStorageRef) {
    return null;
  }

  const legacyToken = legacyStorageRef.getItem(ADMIN_TOKEN_KEY);
  if (!legacyToken) {
    return null;
  }

  if (sessionStorageRef) {
    sessionStorageRef.setItem(ADMIN_TOKEN_KEY, legacyToken);
  }
  legacyStorageRef.removeItem(ADMIN_TOKEN_KEY);

  return legacyToken;
}

export function clearAdminToken() {
  const sessionStorageRef = getSessionStorage();
  const legacyStorageRef = getLegacyStorage();

  if (sessionStorageRef) {
    sessionStorageRef.removeItem(ADMIN_TOKEN_KEY);
  }

  if (legacyStorageRef) {
    legacyStorageRef.removeItem(ADMIN_TOKEN_KEY);
  }
}
