import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../context/AuthContext';
import { AuthFlowError } from '../../features/auth/service';
import { isValidEmailAddress } from '../../features/auth/utils';

const FEATURE_BULLETS = [
  {
    icon: 'visibility',
    title: 'Multi-branch visibility',
    text: 'Track operations, staffing, and performance across every center from one secure workspace.',
  },
  {
    icon: 'co_present',
    title: 'Real-time attendance',
    text: 'Monitor check-ins, class presence, and staff activity with live operational context.',
  },
  {
    icon: 'payments',
    title: 'Smart fee tracking',
    text: 'Follow invoices, dues, and financial health with branch-aware reporting built in.',
  },
] as const;

function validateLoginEmail(email: string): string {
  if (!email.trim()) {
    return 'Email is required.';
  }

  if (!isValidEmailAddress(email)) {
    return 'Enter a valid email address.';
  }

  return '';
}

function SealMotif() {
  return (
    <div className="auth-seal" aria-hidden="true">
      <svg viewBox="0 0 240 240" fill="none">
        <defs>
          <path id="seal-path" d="M120 28a92 92 0 1 1 0 184a92 92 0 0 1 0-184Z" />
        </defs>
        <circle cx="120" cy="120" r="102" stroke="rgba(255,255,255,0.28)" strokeWidth="2" />
        <circle cx="120" cy="120" r="82" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
        <text fill="rgba(255,255,255,0.88)" fontFamily="Roboto, sans-serif" fontSize="11" letterSpacing="2">
          <textPath href="#seal-path" startOffset="3%">
            SANSKARDIP SHIKSHALAYA • TUITION MANAGEMENT SYSTEM •
          </textPath>
        </text>
        <circle cx="120" cy="120" r="46" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.18)" />
        <path
          d="M120 84l10 20 22 3-16 15 4 22-20-10-20 10 4-22-16-15 22-3 10-20Z"
          fill="rgba(243,156,18,0.96)"
        />
      </svg>
    </div>
  );
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
      <div className="auth-split">
        <section className="auth-hero">
          <div className="auth-hero-content">
            <div className="auth-wordmark">
              <div className="auth-wordmark-mark">
                <span className="material-symbols-outlined">school</span>
              </div>
              <div>
                <div className="auth-wordmark-title">TMS</div>
                <p className="auth-wordmark-subtitle">Institution operations, aligned.</p>
              </div>
            </div>

            <h1 className="auth-hero-title">Welcome to TMS</h1>
            <p className="auth-hero-description">
              Manage branches, classrooms, finance, and day-to-day school operations from one trusted platform.
            </p>

            <ul className="auth-feature-list">
              {FEATURE_BULLETS.map((feature) => (
                <li key={feature.title} className="auth-feature-item">
                  <span className="material-symbols-outlined auth-feature-icon">{feature.icon}</span>
                  <div>
                    <div className="auth-feature-title">{feature.title}</div>
                    <p className="auth-feature-text">{feature.text}</p>
                  </div>
                </li>
              ))}
            </ul>

            <SealMotif />
          </div>
        </section>

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
