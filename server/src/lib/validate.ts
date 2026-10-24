import type { z } from 'zod';
import { BizError } from './resp.js';

export function parseInput<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    if (!issue) throw new BizError(400, '参数错误');
    const field = issue.path.filter((part) => typeof part === 'string').join('.');
    throw new BizError(400, field ? `${field}: ${issue.message}` : issue.message);
  }
  return result.data;
}
