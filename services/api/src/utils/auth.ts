import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { customSession, twoFactor } from 'better-auth/plugins';
import bcrypt from 'bcryptjs';
import prisma from './db';
import { sendVerificationCode } from './delivery';
import { validateRuntimeConfig } from './runtime-config';

const runtimeConfig = validateRuntimeConfig();

export const auth = betterAuth({
  secret: runtimeConfig.authSecret,
  appName: 'TMS',
  baseURL: runtimeConfig.authUrl,
  trustedOrigins: [runtimeConfig.webOrigin],
  // Store counters in PostgreSQL so limits survive restarts and apply to every
  // API instance. The long default window also prevents cleanup from removing
  // an active custom-rule counter.
  rateLimit: {
    enabled: true,
    storage: 'database',
    window: 15 * 60,
    max: 100,
    customRules: {
      '/sign-in/email': { window: 15 * 60, max: 5 },
      '/two-factor/send-otp': { window: 15 * 60, max: 5 },
      '/two-factor/verify-otp': { window: 15 * 60, max: 5 },
      '/request-password-reset': { window: 15 * 60, max: 5 },
    },
  },
  // Do not accept a caller-supplied forwarding header until the production
  // reverse proxy is explicitly configured as trusted. With no configured
  // proxy, Better Auth uses its safe shared bucket instead of trusting a
  // spoofable client IP value.
  advanced: {
    ipAddress: { ipAddressHeaders: [] },
  },
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  user: {
    additionalFields: {
      tenantId: { type: 'string', required: true, input: false },
      status: { type: 'string', required: true, input: false, defaultValue: 'ACTIVE' },
    },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    password: {
      hash: (password) => bcrypt.hash(password, 10),
      verify: ({ password, hash }) => bcrypt.compare(password, hash),
    },
    revokeSessionsOnPasswordReset: true,
  },
  session: {
    expiresIn: 60 * 60 * 24,
    updateAge: 60 * 60,
  },
  plugins: [
    twoFactor({
      // Email identifies the account; the OTP is delivered to its verified mobile.
      totpOptions: { disable: true },
      otpOptions: {
        period: 5,
        allowedAttempts: 5,
        storeOTP: 'hashed',
        sendOTP: async ({ user, otp }) => {
          await sendVerificationCode(user.email, otp, 'TWO_FACTOR');
        },
      },
    }),
    customSession(async ({ user, session }) => {
      const assignments = await prisma.userRole.findMany({
        where: { userId: user.id },
        include: { role: true },
      });
      return {
        user: {
          ...user,
          roles: assignments.map((assignment) => ({
            roleName: assignment.role.name,
            permissions: Array.isArray(assignment.role.permissions)
              ? (assignment.role.permissions as string[])
              : [],
            branchId: assignment.branchId,
          })),
        },
        session,
      };
    }),
  ],
});
