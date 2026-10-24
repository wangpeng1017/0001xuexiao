import { SignJWT, jwtVerify } from 'jose';

export interface VerifiedToken {
  sub: string;
}

export function createTokenService(secret: string) {
  const key = new TextEncoder().encode(secret);

  return {
    async sign(user: { id: string; username: string; role: string }): Promise<string> {
      return new SignJWT({ username: user.username, role: user.role })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(user.id)
        .setIssuedAt()
        .setExpirationTime('7d')
        .sign(key);
    },

    async verify(token: string): Promise<VerifiedToken | null> {
      try {
        const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
        return typeof payload.sub === 'string' ? { sub: payload.sub } : null;
      } catch {
        return null;
      }
    }
  };
}

export type TokenService = ReturnType<typeof createTokenService>;
