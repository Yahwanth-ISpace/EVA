export function sabrinaApiBase(): string {
  const url = process.env.SABRINA_API_URL?.trim().replace(/\/+$/, '');
  if (!url) {
    throw new Error('SABRINA_API_URL is not set');
  }
  if (!url.startsWith('https://')) {
    throw new Error('SABRINA_API_URL must use https');
  }
  return url;
}

export function sabrinaVerificationCode(): string {
  const code = process.env.SABRINA_VERIFICATION_CODE?.trim();
  if (!code) {
    throw new Error('SABRINA_VERIFICATION_CODE is not set');
  }
  return code;
}
