import webpush from 'web-push';

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

let cachedVapidKeys: VapidKeys | null = null;

const DEFAULT_SUBJECT = 'mailto:huuquoc7603@gmail.com';

/**
 * Retrieves configured VAPID keys from environment variables or auto-generates
 * an active in-memory pair if none are found.
 */
export function getVapidKeys(): VapidKeys {
  if (cachedVapidKeys) {
    return cachedVapidKeys;
  }

  const envPublicKey =
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    process.env.VAPID_PUBLIC_KEY ||
    '';
  const envPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
  const envSubject = process.env.VAPID_SUBJECT || DEFAULT_SUBJECT;

  if (envPublicKey.trim() && envPrivateKey.trim()) {
    cachedVapidKeys = {
      publicKey: envPublicKey.trim(),
      privateKey: envPrivateKey.trim(),
      subject: envSubject.trim(),
    };
    return cachedVapidKeys;
  }

  // Auto-generate VAPID keys if none configured
  console.log('⚡ No VAPID keys found in environment. Generating dynamic VAPID keypair...');
  const generated = webpush.generateVAPIDKeys();
  cachedVapidKeys = {
    publicKey: generated.publicKey,
    privateKey: generated.privateKey,
    subject: envSubject,
  };

  return cachedVapidKeys;
}

/**
 * Returns the public VAPID applicationServerKey for client-side subscription.
 */
export function getVapidPublicKey(): string {
  return getVapidKeys().publicKey;
}

/**
 * Override VAPID keys (primarily used in automated test suites).
 */
export function setCustomVapidKeys(keys: VapidKeys | null) {
  cachedVapidKeys = keys;
}
