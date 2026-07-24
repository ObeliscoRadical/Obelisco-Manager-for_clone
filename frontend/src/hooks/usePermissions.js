import { useAuth } from '../contexts/AuthContext';

/**
 * Verifica se o utilizador actual tem permissão para ver um módulo.
 * Regras:
 * - Admin (role='admin') tem tudo.
 * - Técnico (__kind='tech') só tem 'tech_portal'.
 * - Outros: usa `module_permissions[key]` se definido; senão true (fallback permissivo até primeiro user ser guardado com perms).
 */
export function useHasPermission(moduleKey) {
  const { user } = useAuth();
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.__kind === 'tech') return moduleKey === 'tech_portal';
  const perms = user.module_permissions;
  if (!perms) return true;
  return perms[moduleKey] === true;
}

export function useCurrentPermissions() {
  const { user } = useAuth();
  return user?.module_permissions || null;
}
