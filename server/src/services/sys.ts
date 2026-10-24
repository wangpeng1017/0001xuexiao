import type { PrismaClient, User } from '@prisma/client';
import { hashPassword, validatePasswordStrength, verifyPassword } from '../lib/password.js';
import { BizError } from '../lib/resp.js';
import { isRole, type Role } from '../types.js';

const MAX_FAILURES = 5;
const LOCK_MINUTES = 10;
const LOCK_MESSAGE = '登录失败次数过多，请 10 分钟后再试';

export interface Userinfo {
  id: string;
  username: string;
  nickname: string;
  role: Role;
  mustChangePwd: boolean;
}

export function toUserinfo(user: {
  id: string;
  username: string;
  nickname: string;
  role: string;
  mustChangePwd: boolean;
}): Userinfo {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    role: isRole(user.role) ? user.role : 'student',
    mustChangePwd: user.mustChangePwd
  };
}

export async function loginUser(
  prisma: PrismaClient,
  username: string,
  password: string
): Promise<User> {
  const now = new Date();
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) throw new BizError(400, '用户名或密码错误');
  if (user.disabled) throw new BizError(400, '账号已禁用');
  if (user.lockedUntil && user.lockedUntil.getTime() > now.getTime()) {
    throw new BizError(400, LOCK_MESSAGE);
  }

  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    const nextFailCount = user.failCount + 1;
    if (nextFailCount >= MAX_FAILURES) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failCount: 0,
          lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60 * 1000)
        }
      });
      throw new BizError(400, LOCK_MESSAGE);
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { failCount: nextFailCount, lockedUntil: null }
    });
    throw new BizError(400, '用户名或密码错误');
  }

  if (user.failCount !== 0 || user.lockedUntil !== null) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failCount: 0, lockedUntil: null }
    });
  }

  return user;
}

export async function changeOwnPassword(
  prisma: PrismaClient,
  userId: string,
  oldPassword: string,
  newPassword: string
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new BizError(886, '账号不存在或已被删除');

  const oldPasswordOk = await verifyPassword(oldPassword, user.passwordHash);
  if (!oldPasswordOk) throw new BizError(400, '原密码错误');

  const weakReason = validatePasswordStrength(newPassword);
  if (weakReason) throw new BizError(400, weakReason);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(newPassword),
      mustChangePwd: false,
      failCount: 0,
      lockedUntil: null
    }
  });
}
