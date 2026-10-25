import type { z } from 'zod';
import { BizError } from './resp.js';

// GoView 等前端常把“未填写”传成 null（如新建项目时 remarks: null），统一视为未提供
function dropNullFields(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== null));
}

export function parseInput<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(dropNullFields(value));
  if (!result.success) {
    const issue = result.error.issues[0];
    if (!issue) throw new BizError(400, '参数错误');
    const field = issue.path.filter((part) => typeof part === 'string').join('.');
    throw new BizError(400, field ? `${field}: ${issue.message}` : issue.message);
  }
  return result.data;
}
