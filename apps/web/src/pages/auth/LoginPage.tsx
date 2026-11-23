import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../context/AuthContext';
import { AuthFlowError } from '../../features/auth/service';
import { isValidEmailAddress } from '../../features/auth/utils';
import { InstitutionShowcase } from './InstitutionShowcase';

function validateLoginEmail(email: string): string {
  if (!email.trim()) {
    return 'Email is required.';
  }

  if (!isValidEmailAddress(email)) {
    return 'Enter a valid email address.';
  }

  return '';
}

export function LoginPage() {
  const { login, attemptCount } = useAuth();
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lockDialogOpen, setLockDialogOpen] = useState(false);

  const canSubmit = email.trim().length > 0 && password.trim().length > 0;

  const handleEmailBlur = () => {
    setEmailTouched(true);
    setEmailError(validateLoginEmail(email));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextEmailError = validateLoginEmail(email);
    setEmailTouched(true);
    setEmailError(nextEmailError);

    if (nextEmailError || attemptCount >= 5) {
      if (attemptCount >= 5) {
        setLockDialogOpen(true);
      }
      return;
    }

    setIsSubmitting(true);

    try {
      await login(email, password, rememberMe);
    } catch (error) {
      if (error instanceof AuthFlowError && error.code === 'ACCOUNT_LOCKED') {
        setLockDialogOpen(true);
      } else if (error instanceof AuthFlowError && error.code === 'SERVICE_UNAVAILABLE') {
        showToast(error.message, 'error', 5000);
      } else {
        const nextRemainingAttempts = Math.max(0, 4 - attemptCount);
        showToast(
          `Invalid email or password. ${nextRemainingAttempts} attempt${nextRemainingAttempts === 1 ? '' : 's'} remaining before account lock.`,
          'error',
          4000
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-split auth-split--showcase">
        <InstitutionShowcase />

        <section className="auth-form-panel">
          <div className="auth-form-inner">
            <div className="auth-form-heading">
              <div className="auth-form-kicker">
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                  lock
                </span>
                Secure access
              </div>
              <h2 className="auth-form-title">Sign in to TMS</h2>
              <p className="auth-form-subtitle">Use your registered institutional account to continue.</p>
            </div>

            <form className="auth-form" onSubmit={handleSubmit} noValidate>
              <div className="auth-field">
                <label className="auth-label" htmlFor="login-email">
                  Email or login ID
                </label>
                <div className="auth-input-wrap">
                  <span className="material-symbols-outlined auth-input-icon">mail</span>
                  <input
                    id="login-email"
                    className={`auth-input auth-input--with-leading-icon${emailTouched && emailError ? ' auth-input-invalid' : ''}`}
                    type="email"
                    value={email}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setEmail(nextValue);
                      if (emailTouched) {
                        setEmailError(validateLoginEmail(nextValue));
                      }
                    }}
                    onBlur={handleEmailBlur}
                    autoComplete="email"
                    placeholder="you@institution.edu.np"
                    required
                  />
                </div>
                {emailTouched && emailError
                  ? <p className="auth-helper-text auth-helper-text--error">{emailError}</p>
                  : <p className="auth-helper-text">Students and parents: use the login ID sent to you by SMS.</p>}
              </div>

              <div className="auth-field">
                <div className="auth-label-row">
                  <label className="auth-label" htmlFor="login-password">
                    Password
                  </label>
                  <Link to="/forgot-password" className="auth-text-link">
                    Forgot Password?
                  </Link>
                </div>
                <div className="auth-input-wrap">
                  <span className="material-symbols-outlined auth-input-icon">lock</span>
                  <input
                    id="login-password"
                    className="auth-input auth-input--with-leading-icon"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    required
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              <div className="auth-remember">
                <label className="auth-checkbox">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
                  />
                  <span>Remember Me</span>
                </label>
              </div>

              <button type="submit" className="auth-submit-btn" disabled={!canSubmit || isSubmitting}>
                {isSubmitting ? (
                  <>
                    <span className="auth-spinner" aria-hidden="true" />
                    Signing in…
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                      login
                    </span>
                    Sign In
                  </>
                )}
              </button>
            </form>

          </div>
        </section>
      </div>

      {lockDialogOpen ? (
        <div className="auth-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="account-lock-title">
          <div className="auth-dialog">
            <span className="material-symbols-outlined" style={{ fontSize: '42px', color: 'var(--color-error)' }}>
              lock
            </span>
            <h3 className="auth-dialog-title" id="account-lock-title">
              Account locked
            </h3>
            <p className="auth-dialog-body">
              Your account is locked after 5 failed attempts. Reset your password to regain access or contact your administrator for help.
            </p>
            <div className="auth-dialog-actions">
              <Link to="/forgot-password" className="auth-submit-btn" style={{ textDecoration: 'none' }}>
                Reset Password
              </Link>
              <a href="mailto:support@tms.edu.np" className="auth-text-link" style={{ textAlign: 'center' }}>
                Contact Admin
              </a>
              <button type="button" className="auth-link-button" onClick={() => setLockDialogOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
