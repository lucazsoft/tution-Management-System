import prisma from './db';
import { trustedSecurityMobile } from './security-mobile';

type SecurityUser = {
  id: string;
  status: string;
  phone: string;
  securityMobile?: string | null;
  securityMobileVerifiedAt?: Date | null;
};

export type ResolvedSecurityMobile =
  | { via: 'SELF'; phone: string }
  | {
      via: 'GUARDIAN';
      phone: string;
      guardianUserId: string;
      guardianVerifiedAt: Date | null;
    };

/**
 * The verified phone that receives this account's reset and two-step codes
 * (docs/planphone.md, phase 5).
 *
 * A student set to "Use parent's number as primary" has no phone of their own:
 * their codes go to the primary guardian's phone, and only while that guardian
 * is ACTIVE and has verified the number. Everyone else uses their own verified
 * security mobile, exactly as before. Returns null when nothing is trusted.
 */
export async function resolveSecurityMobile(user: SecurityUser): Promise<ResolvedSecurityMobile | null> {
  if (user.status !== 'ACTIVE') return null;

  const student = await prisma.student.findUnique({
    where: { userId: user.id },
    select: {
      usesGuardianPhone: true,
      studentParents: {
        select: {
          isPrimary: true,
          parent: { select: { user: { select: {
            id: true, status: true, phone: true, securityMobile: true, securityMobileVerifiedAt: true,
          } } } },
        },
      },
    },
  });

  if (student?.usesGuardianPhone) {
    const link = student.studentParents.find((entry) => entry.isPrimary) ?? student.studentParents[0];
    const guardian = link?.parent.user;
    if (!guardian || guardian.status !== 'ACTIVE') return null;
    const phone = trustedSecurityMobile(guardian);
    return phone
      ? { via: 'GUARDIAN', phone, guardianUserId: guardian.id, guardianVerifiedAt: guardian.securityMobileVerifiedAt ?? null }
      : null;
  }

  const phone = trustedSecurityMobile(user);
  return phone ? { via: 'SELF', phone } : null;
}
