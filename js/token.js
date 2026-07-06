export const ADMIN_TOKEN_KEY = "admin_token";
export const COMPUTER_ACCESS_KEY = "computer_access_granted";
export const COMPUTER_OPERATOR_NAME_KEY = "computer_operator_name";

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

export function setComputerAccess(operatorName) {
  const sessionStorageRef = getSessionStorage();
  if (!sessionStorageRef) {
    return;
  }

  sessionStorageRef.setItem(COMPUTER_ACCESS_KEY, '1');
  sessionStorageRef.setItem(COMPUTER_OPERATOR_NAME_KEY, String(operatorName || '').trim());
}

export function getComputerAccessGranted() {
  const sessionStorageRef = getSessionStorage();
  if (!sessionStorageRef) {
    return false;
  }

  return sessionStorageRef.getItem(COMPUTER_ACCESS_KEY) === '1';
}

export function getComputerOperatorName() {
  const sessionStorageRef = getSessionStorage();
  if (!sessionStorageRef) {
    return '';
  }

  return sessionStorageRef.getItem(COMPUTER_OPERATOR_NAME_KEY) || '';
}

export function clearComputerAccess() {
  const sessionStorageRef = getSessionStorage();
  if (!sessionStorageRef) {
    return;
  }

  sessionStorageRef.removeItem(COMPUTER_ACCESS_KEY);
  sessionStorageRef.removeItem(COMPUTER_OPERATOR_NAME_KEY);
}
