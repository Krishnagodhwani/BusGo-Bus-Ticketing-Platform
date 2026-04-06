export const saveAuth = (token, user) => {
  localStorage.setItem('access_token', token);
  localStorage.setItem('user', JSON.stringify(user));
};

export const getUser = () => {
  const u = localStorage.getItem('user');
  return u ? JSON.parse(u) : null;
};

export const getToken = () => localStorage.getItem('access_token');

export const getOperatorAccessLevel = () => {
  const user = getUser();
  return user?.operator_access_level || 'OWNER';
};

export const hasOperatorAccess = (allowedLevels = []) => {
  const user = getUser();
  if (!user || user.role !== 'OPERATOR') return false;
  if (!allowedLevels.length) return true;
  return allowedLevels.includes(user.operator_access_level || 'OWNER');
};

export const clearAuth = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('user');
};
