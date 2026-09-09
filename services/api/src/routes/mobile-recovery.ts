import { Router } from 'express';
import { consumePersistentRateLimit } from '../utils/persistent-rate-limit';
import { hashCode } from '../utils/otp';
import { confirmMobileRecovery, RecoveryError, sendRecoveryCode } from '../services/mobile-recovery';

const router = Router();
// These public endpoints authenticate a support-issued 256-bit token, not a session.
async function limited(ip: string, token: string) {
  const byIp = await consumePersistentRateLimit(`recovery-ip:${hashCode(ip)}`, 15 * 60_000, 20);
  if (!byIp.allowed) return false;
  return (await consumePersistentRateLimit(`recovery-token:${hashCode(token)}`, 15 * 60_000, 10)).allowed;
}
router.post('/send', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const token = req.body?.token;
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token) || Object.keys(req.body).some(key => key !== 'token')) return res.status(400).json({ error: 'Enter the recovery token provided by platform support.' });
  try {
    if (!await limited(req.ip ?? 'unknown', token)) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    return res.json(await sendRecoveryCode(token));
  } catch (error) { return res.status(error instanceof RecoveryError ? 400 : 503).json({ error: error instanceof RecoveryError ? error.message : 'Recovery is temporarily unavailable.' }); }
});
router.post('/confirm', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { token, code } = req.body ?? {};
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token) || typeof code !== 'string' || !/^\d{6}$/.test(code) || Object.keys(req.body).some(key => !['token', 'code'].includes(key))) return res.status(400).json({ error: 'Enter your recovery token and six-digit code.' });
  try {
    if (!await limited(req.ip ?? 'unknown', token)) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    return res.json(await confirmMobileRecovery(token, code));
  } catch (error) { return res.status(error instanceof RecoveryError ? 400 : 503).json({ error: error instanceof RecoveryError ? error.message : 'Recovery is temporarily unavailable.' }); }
});
export default router;
