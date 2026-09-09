import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CountdownTimer } from '../../components/ui/CountdownTimer';
import { OTPInput } from '../../components/ui/OTPInput';
import { useToast } from '../../components/ui/Toast';
import {
  AuthFlowError,
  requestPasswordResetOtp,
  resendPasswordResetOtp,
  verifyPasswordResetOtp,
} from '../../features/auth/service';
import { isValidEmailAddress } from '../../features/auth/utils';

type ForgotPasswordStep = 'email' | 'otp';

const OTP_DURATION_SECONDS = 5 * 60;

function validateRecoveryEmail(email: string): string {
  if (!email.trim()) {
    return 'Email is required.';
  }

  if (!isValidEmailAddress(email)) {
    return 'Enter a valid email address.';
  }

  return '';
}

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [step, setStep] = useState<ForgotPasswordStep>('email');
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [otp, setOtp] = useState<string[]>(Array(6).fill(''));
  const [otpError, setOtpError] = useState('');
  const [otpExpired, setOtpExpired] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timerKey, setTimerKey] = useState(0);

  const isOtpFilled = otp.every((digit) => digit.length === 1);

  const handleEmailBlur = () => {
    setEmailTouched(true);
    setEmailError(validateRecoveryEmail(email));
  };

  const handleSendOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextEmailError = validateRecoveryEmail(email);
    setEmailTouched(true);
    setEmailError(nextEmailError);

    if (nextEmailError) {
      return;
    }

    setIsSubmitting(true);

    try {
      await requestPasswordResetOtp(email);
      setOtp(Array(6).fill(''));
      setOtpError('');
      setOtpExpired(false);
      setTimerKey((current) => current + 1);
      setStep('otp');
      showToast('If the account can use SMS recovery, a 6-digit code was sent to its verified security mobile.', 'success');
    } catch (error) {
      const message =
        error instanceof AuthFlowError ? error.message : 'Unable to send the OTP right now. Please try again.';
      setEmailError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (otpValue: string) => {
    if (otpValue.length !== 6 || otpExpired || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setOtpError('');

    try {
      const token = await verifyPasswordResetOtp(email, otpValue);
      showToast('OTP verified. You can now set a new password.', 'success');
      navigate(`/reset-password/${token}`);
    } catch (error) {
      const message =
        error instanceof AuthFlowError ? error.message : 'The OTP could not be verified. Please try again.';
      setOtpError(message);
      showToast(message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendOtp = async () => {
    setIsSubmitting(true);

    try {
      await resendPasswordResetOtp(email);
      setOtp(Array(6).fill(''));
      setOtpError('');
      setOtpExpired(false);
      setTimerKey((current) => current + 1);
      showToast('A fresh OTP has been sent.', 'success');
    } catch (error) {
      const message =
        error instanceof AuthFlowError ? error.message : 'Unable to resend the OTP right now. Please try again.';
      setOtpError(message);
      showToast(message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-centered-card">
        <Link to="/login" className="auth-back-link">
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
            arrow_back
          </span>
          Back to Sign In
        </Link>
        <p><Link to="/recover-mobile">Lost access to your security mobile?</Link></p>

        {step === 'email' ? (
          <div className="auth-step-shell" data-step="email">
            <div className="auth-form-heading">
              <h1 className="auth-form-title">Forgot Password?</h1>
              <p className="auth-form-subtitle">Enter your login email. The reset code is sent by SMS to your verified security mobile.</p>
            </div>

            <form className="auth-form" onSubmit={handleSendOtp} noValidate>
              <div className="auth-field">
                <label className="auth-label" htmlFor="forgot-password-email">
                  Registered email
                </label>
                <div className="auth-input-wrap">
                  <span className="material-symbols-outlined auth-input-icon">mail</span>
                  <input
                    id="forgot-password-email"
                    className={`auth-input auth-input--with-leading-icon${emailTouched && emailError ? ' auth-input-invalid' : ''}`}
                    type="email"
                    value={email}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setEmail(nextValue);
                      if (emailTouched) {
                        setEmailError(validateRecoveryEmail(nextValue));
                      }
                    }}
                    onBlur={handleEmailBlur}
                    autoComplete="email"
                    placeholder="you@institution.edu.np"
                    required
                  />
                </div>
                {emailTouched && emailError ? <p className="auth-helper-text auth-helper-text--error">{emailError}</p> : null}
              </div>

              <button type="submit" className="auth-submit-btn" disabled={!email.trim() || isSubmitting}>
                {isSubmitting ? (
                  <>
                    <span className="auth-spinner" aria-hidden="true" />
                    Sending OTP…
                  </>
                ) : (
                  'Send OTP'
                )}
              </button>
            </form>
          </div>
        ) : (
          <div className="auth-step-shell" data-step="otp">
            <div className="auth-form-heading">
              <h1 className="auth-form-title">Verify OTP</h1>
              <p className="auth-form-subtitle">If eligible, we sent a 6-digit SMS code to the account&apos;s verified security mobile.</p>
            </div>

            <div className="auth-otp-message">
              Enter the code exactly as received. The code expires in 5 minutes for your security.
            </div>

            <div className="auth-form">
              <OTPInput
                value={otp}
                onChange={(nextOtp: string[]) => {
                  setOtp(nextOtp);
                  if (otpError) {
                    setOtpError('');
                  }
                }}
                onComplete={handleVerifyOtp}
                disabled={isSubmitting || otpExpired}
                error={Boolean(otpError)}
              />

              {otpError ? <p className="auth-helper-text auth-helper-text--error">{otpError}</p> : null}

              <div className="auth-otp-meta">
                <span className={`auth-otp-status${otpExpired ? ' auth-otp-status--error' : ''}`}>
                  {otpExpired ? (
                    'OTP expired'
                  ) : (
                    <>
                      Expires in{' '}
                      <CountdownTimer
                        durationSeconds={OTP_DURATION_SECONDS}
                        resetKey={timerKey}
                        onExpire={() => {
                          setOtpExpired(true);
                          setOtpError('This OTP has expired. Request a new one to continue.');
                        }}
                      />
                    </>
                  )}
                </span>

                <button
                  type="button"
                  className="auth-link-button"
                  disabled={!otpExpired || isSubmitting}
                  onClick={handleResendOtp}
                >
                  Resend OTP
                </button>
              </div>

              <button
                type="button"
                className="auth-submit-btn"
                disabled={!isOtpFilled || isSubmitting || otpExpired}
                onClick={() => handleVerifyOtp(otp.join(''))}
              >
                {isSubmitting ? (
                  <>
                    <span className="auth-spinner" aria-hidden="true" />
                    Verifying…
                  </>
                ) : (
                  'Verify'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
