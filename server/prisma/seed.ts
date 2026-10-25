import 'dotenv/config';
import path from 'node:path';
import type { User } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import { generatePassword, hashPassword } from '../src/lib/password.js';
import { importSeedContent } from '../src/services/seed-content.js';
import { isRole, type AuthUser } from '../src/types.js';

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const dataDir = path.resolve(process.cwd(), process.env.DATA_DIR || './data');
  return `file:${path.join(dataDir, 'app.db').replace(/\\/g, '/')}`;
}

const prisma = new PrismaClient({ datasourceUrl: resolveDatabaseUrl() });

function toAuthUser(user: User): AuthUser {
  if (!isRole(user.role)) {
    throw new Error(`管理员账号角色不合法：${user.role}`);
  }
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    role: user.role,
    disabled: user.disabled,
    mustChangePwd: user.mustChangePwd
  };
}

async function ensureAdmin(): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { username: 'admin' } });
  if (existing) {
    console.log('admin 用户已存在，跳过账号初始化');
    return existing;
  }

  const providedPassword = process.env.ADMIN_INIT_PASSWORD?.trim();
  const password = providedPassword || generatePassword();

  const admin = await prisma.user.create({
    data: {
      username: 'admin',
      nickname: '管理员',
      passwordHash: await hashPassword(password),
      role: 'admin',
      mustChangePwd: true
    }
  });

  console.log('已创建初始管理员账号');
  console.log('  用户名: admin');
  console.log(`  密码: ${password}`);
  console.log('  首次登录后必须修改密码');
  return admin;
}

async function main(): Promise<void> {
  const admin = await ensureAdmin();
  const dataDir = path.resolve(process.cwd(), process.env.DATA_DIR || './data');
  const result = await importSeedContent(prisma, toAuthUser(admin), { dataDir });

  console.log(
    `预置素材：新增 ${result.materials.created} 个，跳过 ${result.materials.skipped} 个（已存在）`
  );
  console.log(
    `预置模板：新增 ${result.templates.created} 个，跳过 ${result.templates.skipped} 个（已存在）`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
