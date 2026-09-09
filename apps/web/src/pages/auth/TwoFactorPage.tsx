import { useState } from 'react';
import { CountdownTimer } from '../../components/ui/CountdownTimer';
import { OTPInput } from '../../components/ui/OTPInput';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../context/AuthContext';
import {
  AuthFlowError,
  getFriendlyErrorMessage,
  resendTwoFactorChallenge,
  verifyTwoFactorChallenge,
} from '../../features/auth/service';

const TWO_FACTOR_DURATION_SECONDS = 5 * 60;

export function TwoFactorPage() {
  const { user, verify2FA } = useAuth();
  const { showToast } = useToast();
  const [otp, setOtp] = useState<string[]>(Array(6).fill(''));
  const [trustDevice, setTrustDevice] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);
  const [codeExpired, setCodeExpired] = useState(false);
  const [timerKey, setTimerKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const destinationHint = 'your verified security mobile';
  const isOtpFilled = otp.every((digit) => digit.length === 1);

  const handleVerify = async (otpValue: string) => {
    if (!user || isSubmitting || codeExpired || otpValue.length !== 6 || attemptsRemaining <= 0) {
      return;
    }

    setIsSubmitting(true);
    setStatusMessage('');

    try {
      await verifyTwoFactorChallenge(user.email, otpValue, trustDevice);
      await verify2FA();
      showToast('Two-factor verification successful.', 'success');
    } catch (error) {
      const nextAttemptsRemaining = attemptsRemaining - 1;
      const message =
        error instanceof AuthFlowError ? error.message : 'We could not verify the code. Please try again.';

      if (nextAttemptsRemaining <= 0) {
        setAttemptsRemaining(0);
        setCodeExpired(true);
        setOtp(Array(6).fill(''));
        setStatusMessage('The code has been invalidated. Request a new one to continue.');
        showToast('Verification failed three times. Request a new code.', 'error');
      } else {
        setAttemptsRemaining(nextAttemptsRemaining);
        setStatusMessage(`${message} ${nextAttemptsRemaining} attempts remaining.`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!user) {
      return;
    }

    setIsSubmitting(true);

    try {
      await resendTwoFactorChallenge(user.email);
      setOtp(Array(6).fill(''));
      setAttemptsRemaining(3);
      setCodeExpired(false);
      setStatusMessage('');
      setTimerKey((current) => current + 1);
      showToast('A new verification code has been sent.', 'success');
    } catch (error) {
      showToast(
        getFriendlyErrorMessage(error, 'Unable to send a verification code right now. Please try again.'),
        'error'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-centered-card">
        <div className="auth-step-shell">
          <div className="auth-form-heading">
            <h1 className="auth-form-title">Two-Factor Authentication</h1>
            <p className="auth-form-subtitle">A verification code has been sent by SMS.</p>
          </div>

          <div className="auth-otp-message">Delivery target: {destinationHint}</div>

          <div className="auth-attempts">
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              warning
            </span>
            {attemptsRemaining} attempts remaining
          </div>

          <div className="auth-form">
            <OTPInput
              value={otp}
              onChange={(nextOtp: string[]) => {
                setOtp(nextOtp);
                if (statusMessage) {
                  setStatusMessage('');
                }
              }}
              onComplete={handleVerify}
              disabled={isSubmitting || codeExpired || attemptsRemaining === 0}
              error={Boolean(statusMessage) && attemptsRemaining < 3}
            />

            {statusMessage ? (
              <p className="auth-helper-text auth-helper-text--error">{statusMessage}</p>
            ) : null}

            <div className="auth-otp-meta">
              <span className={`auth-otp-status${codeExpired ? ' auth-otp-status--error' : ''}`}>
                {codeExpired ? (
                  'Code expired'
                ) : (
                  <>
                    Expires in{' '}
                    <CountdownTimer
                      durationSeconds={TWO_FACTOR_DURATION_SECONDS}
                      resetKey={timerKey}
                      onExpire={() => {
                        setCodeExpired(true);
                        setStatusMessage('This code has expired. Request a new code.');
                      }}
                    />
                  </>
                )}
              </span>

              <button
                type="button"
                className="auth-link-button"
                disabled={!codeExpired || isSubmitting}
                onClick={handleResend}
              >
                Resend Code
              </button>
            </div>

            <label className="auth-checkbox">
              <input
                type="checkbox"
                checked={trustDevice}
                onChange={(event) => setTrustDevice(event.target.checked)}
              />
              <span>Trust this device for 30 days</span>
            </label>

            <button
              type="button"
              className="auth-submit-btn"
              disabled={!isOtpFilled || isSubmitting || codeExpired || attemptsRemaining === 0}
              onClick={() => handleVerify(otp.join(''))}
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
      </div>
    </div>
  );
}
