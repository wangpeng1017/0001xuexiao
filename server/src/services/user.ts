import { Prisma, type PrismaClient } from '@prisma/client';
import { parseCsv } from '../lib/csv.js';
import { generatePassword, hashPassword } from '../lib/password.js';
import { BizError } from '../lib/resp.js';
import type { Role } from '../types.js';

const USERNAME_PATTERN = /^[A-Za-z0-9_]{4,32}$/;
const CSV_HEADER_MESSAGE = 'CSV 表头必须为 username,nickname,role[,password]';
const CSV_ROLE_MESSAGE = '角色必须为 teacher/student 或 教师/学生';

export interface UserListItem {
  id: string;
  username: string;
  nickname: string;
  role: string;
  disabled: boolean;
  createTime: string;
}

export interface CreateUserInput {
  username: string;
  nickname: string;
  role: Role;
  password?: string;
}

export interface EditUserInput {
  id: string;
  nickname?: string;
  role?: Role;
  disabled?: boolean;
}

export interface ImportRowResult {
  line: number;
  username: string;
  ok: boolean;
  reason: string;
  initialPassword: string;
}

export async function listUsers(
  prisma: PrismaClient,
  params: { page: number; limit: number; keyword: string }
): Promise<{ data: UserListItem[]; count: number }> {
  const where: Prisma.UserWhereInput = params.keyword
    ? {
        OR: [
          { username: { contains: params.keyword } },
          { nickname: { contains: params.keyword } }
        ]
      }
    : {};

  const [rows, count] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.limit,
      take: params.limit
    }),
    prisma.user.count({ where })
  ]);

  return {
    data: rows.map((user) => ({
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      role: user.role,
      disabled: user.disabled,
      createTime: user.createdAt.toISOString()
    })),
    count
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function validateUsername(username: string): string | null {
  if (!USERNAME_PATTERN.test(username)) {
    return '用户名需为 4~32 位字母、数字或下划线';
  }
  return null;
}

export async function createUser(
  prisma: PrismaClient,
  input: CreateUserInput
): Promise<{ id: string; initialPassword: string }> {
  const usernameReason = validateUsername(input.username);
  if (usernameReason) throw new BizError(400, usernameReason);

  const existing = await prisma.user.findUnique({ where: { username: input.username } });
  if (existing) throw new BizError(400, '用户名已存在');

  const providedPassword = input.password && input.password.length > 0 ? input.password : null;
  const initialPassword = providedPassword ?? generatePassword();

  try {
    const user = await prisma.user.create({
      data: {
        username: input.username,
        nickname: input.nickname,
        role: input.role,
        passwordHash: await hashPassword(initialPassword),
        mustChangePwd: true
      }
    });
    return { id: user.id, initialPassword };
  } catch (error) {
    if (isUniqueViolation(error)) throw new BizError(400, '用户名已存在');
    throw error;
  }
}

export async function editUser(
  prisma: PrismaClient,
  actorId: string,
  input: EditUserInput
): Promise<void> {
  const target = await prisma.user.findUnique({ where: { id: input.id } });
  if (!target) throw new BizError(404, '用户不存在');

  if (target.id === actorId && input.disabled === true) {
    throw new BizError(400, '不能禁用自己');
  }
  if (target.id === actorId && input.role !== undefined && input.role !== target.role) {
    throw new BizError(400, '不能修改自己的角色');
  }

  const data: Prisma.UserUpdateInput = {};
  if (input.nickname !== undefined) data.nickname = input.nickname;
  if (input.role !== undefined) data.role = input.role;
  if (input.disabled !== undefined) data.disabled = input.disabled;

  await prisma.user.update({ where: { id: target.id }, data });
}

export async function resetUserPassword(
  prisma: PrismaClient,
  userId: string
): Promise<{ initialPassword: string }> {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new BizError(404, '用户不存在');

  const initialPassword = generatePassword();
  await prisma.user.update({
    where: { id: target.id },
    data: {
      passwordHash: await hashPassword(initialPassword),
      mustChangePwd: true,
      failCount: 0,
      lockedUntil: null
    }
  });
  return { initialPassword };
}

function normalizeHeader(fields: string[]): string[] {
  return fields.map((field) => field.trim().toLowerCase());
}

function isValidHeader(fields: string[]): boolean {
  if (fields.length !== 3 && fields.length !== 4) return false;
  if (fields[0] !== 'username' || fields[1] !== 'nickname' || fields[2] !== 'role') {
    return false;
  }
  return fields.length === 3 || fields[3] === 'password';
}

function mapCsvRole(raw: string): Role | null {
  if (raw === 'teacher' || raw === '教师') return 'teacher';
  if (raw === 'student' || raw === '学生') return 'student';
  return null;
}

export async function importUsersFromCsv(
  prisma: PrismaClient,
  csvText: string
): Promise<ImportRowResult[]> {
  const rows = parseCsv(csvText);
  const header = rows[0];
  if (!header) throw new BizError(400, 'CSV 文件为空');
  if (!isValidHeader(normalizeHeader(header.fields))) {
    throw new BizError(400, CSV_HEADER_MESSAGE);
  }

  const results: ImportRowResult[] = [];
  for (const row of rows.slice(1)) {
    const username = (row.fields[0] ?? '').trim();
    const base: ImportRowResult = {
      line: row.line,
      username,
      ok: false,
      reason: '',
      initialPassword: ''
    };

    if (row.fields.length < 3 || row.fields.length > 4) {
      results.push({ ...base, reason: '列数不正确，应为 3~4 列' });
      continue;
    }

    const nickname = (row.fields[1] ?? '').trim();
    const role = mapCsvRole((row.fields[2] ?? '').trim());
    const rawPassword = (row.fields[3] ?? '').trim();
    const usernameReason = validateUsername(username);

    if (usernameReason) {
      results.push({ ...base, reason: usernameReason });
      continue;
    }
    if (!nickname) {
      results.push({ ...base, reason: '姓名不能为空' });
      continue;
    }
    if (nickname.length > 50) {
      results.push({ ...base, reason: '姓名不能超过 50 个字符' });
      continue;
    }
    if (!role) {
      results.push({ ...base, reason: CSV_ROLE_MESSAGE });
      continue;
    }

    try {
      const created = await createUser(prisma, {
        username,
        nickname,
        role,
        password: rawPassword || undefined
      });
      results.push({
        ...base,
        ok: true,
        initialPassword: created.initialPassword
      });
    } catch (error) {
      if (error instanceof BizError) {
        results.push({ ...base, reason: error.message });
        continue;
      }
      throw error;
    }
  }

  return results;
}
