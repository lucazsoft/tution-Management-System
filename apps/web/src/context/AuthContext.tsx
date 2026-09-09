import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { removeAuthToken } from '../services/api';
import { AuthFlowError, ROLE_DEFAULT_PATHS } from '../features/auth/service';
import type { AuthUser } from '../features/auth/types';
import { authClient } from '../features/auth/auth-client';

interface AuthContextValue {
  updateDisplayName: (name: string) => void;
  isTenantAdmin: () => boolean;
  user: AuthUser | null;
  // Kept as a compatibility field for consumers; Better Auth uses an httpOnly cookie.
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isTwoFactorPending: boolean;
  sessionIssue: 'missing' | 'unavailable' | 'signed-out' | null;
  attemptCount: number;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => void;
  roleRedirectPath: () => string;
  verify2FA: () => Promise<void>;
  resetAttemptCount: () => void;
}

const USER_CACHE_KEY = 'tms_user';
const AuthContext = createContext<AuthContextValue | null>(null);

const ROLE_PRIORITY = ['Super Admin', 'Tenant Admin', 'Branch Admin', 'Teacher', 'Accountant', 'Receptionist', 'Janitor', 'Student', 'Parent'];

function mapSessionUser(sessionUser: any): AuthUser {
  const roles = Array.isArray(sessionUser.roles) ? sessionUser.roles : [];
  const roleName = ROLE_PRIORITY.find((candidate) => roles.some((entry: any) => entry?.roleName === candidate))
    ?? roles[0]?.roleName
    ?? 'Teacher';

  return {
    id: sessionUser.id,
    roles: roles.map((entry: any) => ({ roleName: entry.roleName, branchId: entry.branchId })),
    email: sessionUser.email,
    name: sessionUser.name || sessionUser.email,
    role: roleName.toUpperCase().replace(/\s+/g, '_') as AuthUser['role'],
    requiresTwoFactor: false,
    requiresPasswordChange: sessionUser.requiresPasswordChange === true,
    firstLogin: false,
  };
}

function cacheUser(user: AuthUser | null): void {
  if (user) {
    sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
  } else {
    sessionStorage.removeItem(USER_CACHE_KEY);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionIssue, setSessionIssue] = useState<AuthContextValue['sessionIssue']>(null);
  const [attemptCount, setAttemptCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void authClient.getSession()
      .then(({ data, error }) => {
        if (!cancelled) {
          if (error) {
            setUser(null);
            setSessionIssue(Number((error as { status?: number }).status) === 401 ? 'missing' : 'unavailable');
            cacheUser(null);
            return;
          }
          const nextUser = data?.user ? mapSessionUser(data.user) : null;
          setUser(nextUser);
          setSessionIssue(nextUser ? null : 'missing');
          cacheUser(nextUser);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setSessionIssue('unavailable');
          cacheUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const resetAttemptCount = useCallback(() => setAttemptCount(0), []);

  const login = useCallback(async (email: string, password: string) => {
    if (attemptCount >= 5) {
      throw new AuthFlowError('ACCOUNT_LOCKED', 'Your account has been locked after 5 failed attempts.');
    }

    setIsLoading(true);
    try {
      const result = await authClient.signIn.email({ email: email.trim().toLowerCase(), password, dontNavigate: true } as any);
      if (result.error) {
        const authError = result.error as { status?: number; code?: string; message?: string };
        if (
          authError.status === 0
          || authError.code === 'FETCH_ERROR'
          || /failed to fetch|network|unable to connect/i.test(authError.message || '')
        ) {
          throw new AuthFlowError(
            'SERVICE_UNAVAILABLE',
            'Unable to reach the TMS service. Check your connection and try again.',
          );
        }
        throw new AuthFlowError('INVALID_CREDENTIALS', 'Invalid email or password.');
      }
      if ((result?.data as any)?.twoFactorRedirect) {
        const otpResult = await authClient.twoFactor.sendOtp();
        if (otpResult.error) {
          throw new AuthFlowError('TWO_FACTOR_EXPIRED', 'Unable to send a verification code right now. Please try again.');
        }
        const pendingUser: AuthUser = {
          id: '',
          email: email.trim().toLowerCase(),
          name: email.trim().toLowerCase(),
          role: 'TEACHER',
          requiresTwoFactor: true,
          firstLogin: false,
        };
        cacheUser(pendingUser);
        setUser(pendingUser);
        setAttemptCount(0);
        return;
      }
      const sessionData = result?.data ? (await authClient.getSession()).data : null;
      if (!sessionData?.user) {
        throw new AuthFlowError('INVALID_CREDENTIALS', 'Invalid email or password.');
      }

      const nextUser = mapSessionUser(sessionData.user);
      cacheUser(nextUser);
      setUser(nextUser);
      setSessionIssue(null);
      setAttemptCount(0);

    } catch (error) {
      if (error instanceof AuthFlowError && error.code !== 'INVALID_CREDENTIALS') throw error;

      if (!(error instanceof AuthFlowError)) {
        throw new AuthFlowError(
          'SERVICE_UNAVAILABLE',
          'Unable to reach the TMS service. Check your connection and try again.',
        );
      }

      const nextAttemptCount = attemptCount + 1;
      setAttemptCount(nextAttemptCount);
      if (nextAttemptCount >= 5) {
        throw new AuthFlowError('ACCOUNT_LOCKED', 'Your account has been locked after 5 failed attempts.');
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [attemptCount]);

  const logout = useCallback(async () => {
    try {
      await authClient.signOut();
    } finally {
      removeAuthToken();
      cacheUser(null);
      setUser(null);
      setSessionIssue('signed-out');
      setAttemptCount(0);
    }
  }, []);

  const roleRedirectPath = useCallback((): string => {
    if (!user) return '/login';
    if (user.requiresTwoFactor) return '/2fa';
    if (user.requiresPasswordChange) return '/force-change-password';
    if (user.firstLogin && user.role === 'TENANT_ADMIN') return '/setup/tenant';
    if (user.firstLogin && user.role === 'BRANCH_ADMIN') return '/setup/branch';
    if (user.role === 'SUPER_ADMIN') return '/platform/overview';
    return ROLE_DEFAULT_PATHS[user.role] ?? '/login';
  }, [user]);

  const verify2FA = useCallback(async () => {
    const sessionData = (await authClient.getSession()).data;
    if (!sessionData?.user) {
      throw new AuthFlowError('TWO_FACTOR_INVALID', 'Two-factor verification did not create a session. Please sign in again.');
    }
    const verifiedUser = mapSessionUser(sessionData.user);
    cacheUser(verifiedUser);
    setUser(verifiedUser);
    setSessionIssue(null);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    updateDisplayName: (name: string) => setUser(current => { const next = current ? { ...current, name } : null; cacheUser(next); return next; }),
    isTenantAdmin: () => Boolean(user?.roles?.some(role => role.roleName === 'Tenant Admin' && role.branchId === null)),
    user,
    token: null,
    isLoading,
    isAuthenticated: Boolean(user && !user.requiresTwoFactor && !user.requiresPasswordChange),
    isTwoFactorPending: Boolean(user?.requiresTwoFactor),
    sessionIssue,
    attemptCount,
    login,
    logout,
    roleRedirectPath,
    verify2FA,
    resetAttemptCount,
  }), [attemptCount, isLoading, login, logout, roleRedirectPath, sessionIssue, user, verify2FA, resetAttemptCount]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
