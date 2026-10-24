import 'dotenv/config';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { generatePassword, hashPassword } from '../src/lib/password.js';

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const dataDir = path.resolve(process.cwd(), process.env.DATA_DIR || './data');
  return `file:${path.join(dataDir, 'app.db').replace(/\\/g, '/')}`;
}

const prisma = new PrismaClient({ datasourceUrl: resolveDatabaseUrl() });

async function main(): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { username: 'admin' } });
  if (existing) {
    console.log('admin 用户已存在，跳过初始化');
    return;
  }

  const providedPassword = process.env.ADMIN_INIT_PASSWORD?.trim();
  const password = providedPassword || generatePassword();

  await prisma.user.create({
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
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
