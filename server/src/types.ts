import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from './config.js';
import type { TokenService } from './lib/jwt.js';

export const ROLES = ['admin', 'teacher', 'student'] as const;
export type Role = (typeof ROLES)[number];
export const ALL_ROLES: Role[] = [...ROLES];

export type AuthRequirement = 'public' | Role[];

export interface AuthUser {
  id: string;
  username: string;
  nickname: string;
  role: Role;
  disabled: boolean;
  mustChangePwd: boolean;
}

export interface AuthRouteRecord {
  method: string;
  url: string;
  auth: AuthRequirement | undefined;
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

declare module 'fastify' {
  interface FastifyContextConfig {
    auth?: AuthRequirement;
  }

  interface FastifyRequest {
    currentUser: AuthUser | null;
  }

  interface FastifyInstance {
    prisma: PrismaClient;
    config: AppConfig;
    tokens: TokenService;
    authRouteRecords: AuthRouteRecord[];
  }
}
