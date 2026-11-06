import { jwtSecret } from './jwt-config';

const REQUIRED_IN_PRODUCTION = [
  'JWT_SECRET',
  'SSN_ENCRYPTION_KEY',
  'LOGIN_RSA_PRIVATE_KEY',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_PHONE_NUMBER',
  'BACKEND_URL',
  'SABRINA_API_URL',
  'SABRINA_VERIFICATION_CODE',
  'VERIFICATIONS_API_TOKEN',
  'AI_SERVICE_TOKEN',
  'DATABASE_URL',
  'CORS_ORIGINS',
];

export function assertProductionConfig(): void {
  jwtSecret();
  if (process.env.SSN_ENCRYPTION_KEY?.trim() && process.env.SSN_ENCRYPTION_KEY.trim() === process.env.JWT_SECRET?.trim()) {
    throw new Error('SSN_ENCRYPTION_KEY must not reuse JWT_SECRET');
  }
  if (process.env.NODE_ENV !== 'production') return;
  const missing = REQUIRED_IN_PRODUCTION.filter((key) => !process.env[key]?.trim());
  if (missing.length) {
    throw new Error(`Missing required production configuration: ${missing.join(', ')}`);
  }
  const backend = process.env.BACKEND_URL?.trim() ?? '';
  if (!backend.startsWith('https://')) {
    throw new Error('BACKEND_URL must use https in production');
  }
  const sabrina = process.env.SABRINA_API_URL?.trim() ?? '';
  if (!sabrina.startsWith('https://')) {
    throw new Error('SABRINA_API_URL must use https in production');
  }
}
