import { randomInt } from 'node:crypto';
import { compare, hash } from 'bcryptjs';

const BCRYPT_ROUNDS = 10;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const ALL_CHARS = LETTERS + DIGITS;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return compare(password, passwordHash);
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return '密码至少 8 位，且必须同时包含字母和数字';
  }
  return null;
}

export function generatePassword(length = 10): string {
  for (;;) {
    const chars: string[] = [LETTERS[randomInt(LETTERS.length)]!, DIGITS[randomInt(DIGITS.length)]!];
    while (chars.length < length) {
      chars.push(ALL_CHARS[randomInt(ALL_CHARS.length)]!);
    }
    for (let i = chars.length - 1; i > 0; i -= 1) {
      const j = randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j]!, chars[i]!];
    }
    return chars.join('');
  }
}
