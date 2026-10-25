import mysql from 'mysql2/promise';
import { z } from 'zod';
import { BizError } from '../lib/resp.js';

export type DatasetType = 'http' | 'mysql';

export const httpConfigSchema = z.object({
  url: z
    .string({ required_error: 'URL 不能为空' })
    .min(1, 'URL 不能为空')
    .max(2048, 'URL 不能超过 2048 个字符')
    .refine((value) => /^https?:\/\//i.test(value), 'URL 必须以 http:// 或 https:// 开头'),
  method: z.enum(['GET', 'POST']).default('GET'),
  headers: z.record(z.string().max(2048)).default({}),
  body: z.string().max(1024 * 1024, '请求体不能超过 1MB').default(''),
  dataPath: z.string().max(500, '数据路径不能超过 500 个字符').default('')
});

export const mysqlConfigSchema = z.object({
  host: z.string({ required_error: '主机不能为空' }).min(1, '主机不能为空').max(255),
  port: z.coerce.number().int().min(1).max(65535).default(3306),
  database: z.string({ required_error: '数据库名不能为空' }).min(1, '数据库名不能为空').max(128),
  user: z.string({ required_error: '用户名不能为空' }).min(1, '用户名不能为空').max(128),
  password: z.string().max(512).default(''),
  sql: z.string({ required_error: 'SQL 不能为空' }).min(1, 'SQL 不能为空').max(100_000)
});

export type HttpConfig = z.infer<typeof httpConfigSchema>;
export type MysqlConfig = z.infer<typeof mysqlConfigSchema>;
export type DatasetConfig = HttpConfig | MysqlConfig;

export interface DatasetProvider {
  type: DatasetType;
  parseConfig: (raw: unknown) => DatasetConfig;
  fetch: (config: DatasetConfig) => Promise<unknown>;
}

const HTTP_TIMEOUT_MS = 10_000;
const HTTP_MAX_BYTES = 5 * 1024 * 1024;
const MYSQL_TIMEOUT_MS = 10_000;
const MYSQL_MAX_ROWS = 5000;

function parseHttpConfig(raw: unknown): HttpConfig {
  return httpConfigSchema.parse(raw);
}

function parseMysqlConfig(raw: unknown): MysqlConfig {
  return mysqlConfigSchema.parse(raw);
}

function pickDataPath(data: unknown, dataPath: string): unknown {
  if (!dataPath) return data;
  let current: unknown = data;
  for (const key of dataPath.split('.').filter(Boolean)) {
    if (Array.isArray(current)) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        throw new BizError(400, `数据路径 ${dataPath} 不存在`);
      }
      current = current[index];
      continue;
    }
    if (typeof current !== 'object' || current === null) {
      throw new BizError(400, `数据路径 ${dataPath} 不存在`);
    }
    current = (current as Record<string, unknown>)[key];
    if (current === undefined) throw new BizError(400, `数据路径 ${dataPath} 不存在`);
  }
  return current;
}

async function fetchHttp(config: HttpConfig): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { ...config.headers };
    const body = config.method === 'POST' && config.body ? config.body : undefined;
    if (body && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(config.url, {
      method: config.method,
      headers,
      body,
      signal: controller.signal,
      redirect: 'follow'
    }).catch((error: unknown) => {
      if (controller.signal.aborted) throw new BizError(400, 'HTTP 请求超时（10 秒）');
      throw new BizError(400, `HTTP 请求失败：${(error as Error).message}`);
    });

    if (!response.ok) {
      throw new BizError(400, `HTTP 请求失败（状态码 ${response.status}）`);
    }
    const contentLength = Number(response.headers.get('content-length') ?? '0');
    if (contentLength > HTTP_MAX_BYTES) throw new BizError(400, 'HTTP 响应超过 5MB 限制');

    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > HTTP_MAX_BYTES) {
          await reader.cancel();
          throw new BizError(400, 'HTTP 响应超过 5MB 限制');
        }
        chunks.push(value);
      }
    }
    const text = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new BizError(400, 'HTTP 响应不是有效的 JSON');
    }
    return pickDataPath(parsed, config.dataPath);
  } finally {
    clearTimeout(timer);
  }
}

function stripSqlComments(sql: string): { cleaned: string; codeOnly: string } {
  let cleaned = '';
  let codeOnly = '';
  let index = 0;
  while (index < sql.length) {
    const char = sql[index]!;
    const next = sql[index + 1];

    if (char === "'" || char === '"' || char === '`') {
      const quote = char;
      cleaned += char;
      codeOnly += char;
      index += 1;
      let closed = false;
      while (index < sql.length) {
        const current = sql[index]!;
        if (current === '\\' && quote !== '`' && index + 1 < sql.length) {
          cleaned += current + sql[index + 1];
          codeOnly += '  ';
          index += 2;
          continue;
        }
        if (current === quote) {
          if (sql[index + 1] === quote) {
            cleaned += quote + quote;
            codeOnly += '  ';
            index += 2;
            continue;
          }
          cleaned += current;
          codeOnly += current;
          index += 1;
          closed = true;
          break;
        }
        cleaned += current;
        codeOnly += ' ';
        index += 1;
      }
      if (!closed) throw new BizError(400, 'SQL 引号不完整');
      continue;
    }

    if (char === '-' && next === '-' && (sql[index + 2] === undefined || /\s/.test(sql[index + 2]!))) {
      index += 2;
      while (index < sql.length && sql[index] !== '\n') index += 1;
      cleaned += ' ';
      codeOnly += ' ';
      continue;
    }
    if (char === '#') {
      while (index < sql.length && sql[index] !== '\n') index += 1;
      cleaned += ' ';
      codeOnly += ' ';
      continue;
    }
    if (char === '/' && next === '*') {
      if (sql[index + 2] === '!') throw new BizError(400, 'SQL 不允许使用可执行注释');
      const end = sql.indexOf('*/', index + 2);
      if (end < 0) throw new BizError(400, 'SQL 注释不完整');
      index = end + 2;
      cleaned += ' ';
      codeOnly += ' ';
      continue;
    }

    cleaned += char;
    codeOnly += char;
    index += 1;
  }
  return { cleaned, codeOnly };
}

export function validateReadOnlySql(sql: string): string {
  const trimmed = sql.trim();
  if (!trimmed) throw new BizError(400, 'SQL 不能为空');
  const { cleaned, codeOnly } = stripSqlComments(trimmed);
  const statement = cleaned.trim().replace(/;+\s*$/, '');
  if (!statement) throw new BizError(400, 'SQL 不能为空');

  const normalized = codeOnly.trim().replace(/;+\s*$/, '').toLowerCase();
  if (normalized.includes(';')) throw new BizError(400, '只允许执行单条 SQL 语句');
  const isSelect = normalized.startsWith('select');
  const isWithSelect = normalized.startsWith('with') && /\bselect\b/.test(normalized);
  if (!isSelect && !isWithSelect) {
    throw new BizError(400, '只允许执行 SELECT 或 WITH ... SELECT 查询');
  }

  if (/\bfor\s+update\b|\block\s+in\s+share\s+mode\b/.test(normalized)) {
    throw new BizError(400, 'SQL 不允许加锁查询');
  }
  const forbidden = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|rename|call|execute|prepare|deallocate|handler|load_file|outfile|dumpfile)\b/;
  if (forbidden.test(normalized)) throw new BizError(400, 'SQL 包含不允许的关键字');
  return statement;
}

async function fetchMysql(config: MysqlConfig): Promise<unknown> {
  const sql = validateReadOnlySql(config.sql);
  const limitedSql = /\blimit\s+\d+/i.test(sql) ? sql : `${sql} LIMIT ${MYSQL_MAX_ROWS}`;
  let connection: mysql.Connection | null = null;
  try {
    connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      connectTimeout: MYSQL_TIMEOUT_MS,
      dateStrings: true,
      supportBigNumbers: true,
      bigNumberStrings: true
    });
    await connection.query('SET SESSION TRANSACTION READ ONLY');
    await connection.query('START TRANSACTION READ ONLY');
    const [rows] = await connection.query({ sql: limitedSql, timeout: MYSQL_TIMEOUT_MS });
    if (!Array.isArray(rows)) return rows;
    return rows.slice(0, MYSQL_MAX_ROWS);
  } catch (error) {
    if (error instanceof BizError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new BizError(400, `MySQL 查询失败：${message}`);
  } finally {
    if (connection) await connection.end().catch(() => undefined);
  }
}

const providers: Record<DatasetType, DatasetProvider> = {
  http: {
    type: 'http',
    parseConfig: parseHttpConfig,
    fetch: (config) => fetchHttp(config as HttpConfig)
  },
  mysql: {
    type: 'mysql',
    parseConfig: parseMysqlConfig,
    fetch: (config) => fetchMysql(config as MysqlConfig)
  }
};

export function getDatasetProvider(type: string): DatasetProvider {
  const provider = providers[type as DatasetType];
  if (!provider) throw new BizError(400, '不支持的数据集类型');
  return provider;
}

export function parseDatasetConfig(type: string, raw: unknown): DatasetConfig {
  return getDatasetProvider(type).parseConfig(raw);
}

export function redactDatasetConfig(type: string, config: DatasetConfig): DatasetConfig {
  if (type === 'mysql') return { ...(config as MysqlConfig), password: '' };
  return config;
}

export async function fetchDataset(type: string, config: DatasetConfig): Promise<unknown> {
  return getDatasetProvider(type).fetch(config);
}
