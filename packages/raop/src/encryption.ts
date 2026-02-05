import { createCipheriv, createDecipheriv, randomBytes, publicEncrypt, constants } from 'node:crypto';

/**
 * RAOP Encryption utilities
 * Handles AES encryption for audio streams and RSA for key exchange
 */

/**
 * AES encryption configuration for RAOP
 */
export interface AesConfig {
  key: Buffer;
  iv: Buffer;
}

/**
 * Generate random AES key and IV for audio encryption
 */
export function generateAesConfig(): AesConfig {
  return {
    key: randomBytes(16), // AES-128
    iv: randomBytes(16),
  };
}

/**
 * Encrypt AES key with RSA public key (for RAOP key exchange)
 * @param aesKey - The AES key to encrypt
 * @param rsaPublicKey - RSA public key in PEM format
 */
export function encryptAesKey(aesKey: Buffer, rsaPublicKey: string): Buffer {
  return publicEncrypt(
    {
      key: rsaPublicKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
    },
    aesKey
  );
}

/**
 * Create AES cipher for encrypting audio data
 */
export function createAesCipher(config: AesConfig): {
  encrypt: (data: Buffer) => Buffer;
} {
  return {
    encrypt: (data: Buffer): Buffer => {
      const cipher = createCipheriv('aes-128-cbc', config.key, config.iv);
      return Buffer.concat([cipher.update(data), cipher.final()]);
    },
  };
}

/**
 * Create AES decipher for decrypting audio data
 */
export function createAesDecipher(config: AesConfig): {
  decrypt: (data: Buffer) => Buffer;
} {
  return {
    decrypt: (data: Buffer): Buffer => {
      const decipher = createDecipheriv('aes-128-cbc', config.key, config.iv);
      return Buffer.concat([decipher.update(data), decipher.final()]);
    },
  };
}

/**
 * Format AES key and IV for RAOP ANNOUNCE SDP
 * Returns base64-encoded key
 */
export function formatAesKeyForSdp(aesKey: Buffer, rsaEncryptedKey?: Buffer): string {
  if (rsaEncryptedKey) {
    return rsaEncryptedKey.toString('base64');
  }
  return aesKey.toString('base64');
}

/**
 * Apple's RSA public key (for older AirPlay devices)
 * This is the well-known AirPort Express public key
 */
export const AIRPORT_RSA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDKW/+z3TqWuW7VsK/+qKJ0FUQV
9qhxhO3W8yCqqJxKa8+5vqJZ1rBqp7RqNCdqrqyh1ywPNj1F4hQqN9M4W5MK+hf7
LpJM5uj0Ql6AZVJT5dHEbDAOC1fJmH7e7CcFvyZqd7gKwqzVGqPDRwChKMEZbVpR
MLCL6TiJYH0KuNmPRQIDAQAB
-----END PUBLIC KEY-----`;

/**
 * Parse encryption type value from TXT record
 */
function parseEncryptionTypeValue(txtRecords: Record<string, string>): number {
  const et = txtRecords['et'];
  if (!et) return 0;
  
  const etValue = parseInt(et.split(',')[0]);
  return isNaN(etValue) ? 0 : etValue;
}

/**
 * Check if device requires encryption based on TXT records
 */
export function requiresEncryption(txtRecords: Record<string, string>): boolean {
  // et=0 means no encryption
  // et>0 means encryption supported/required
  return parseEncryptionTypeValue(txtRecords) > 0;
}

/**
 * Get encryption type from TXT records
 */
export function getEncryptionType(txtRecords: Record<string, string>): 'none' | 'rsa' | 'fairplay' {
  const etValue = parseEncryptionTypeValue(txtRecords);
  
  if (etValue === 0) return 'none';
  if (etValue === 1 || etValue === 3 || etValue === 5) return 'rsa';
  
  // Higher values typically indicate FairPlay
  return 'fairplay';
}
