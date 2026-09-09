import { normaliseAakashPhoneNumber } from './sms';

// Trust belongs to the verified destination, never to a mutable phone field alone.
export function trustedSecurityMobile(user: {
  phone: string;
  securityMobile?: string | null;
  securityMobileVerifiedAt?: Date | null;
}): string | null {
  const phone = normaliseAakashPhoneNumber(user.phone);
  return user.securityMobileVerifiedAt && /^\d{10}$/.test(phone) && user.securityMobile === phone
    ? phone : null;
}
