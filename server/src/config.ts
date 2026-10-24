import 'dotenv/config';
import path from 'node:path';

export type NodeEnv = 'development' | 'production' | 'test';

export interface AppConfig {
  port: number;
  dataDir: string;
  databaseUrl: string;
  jwtSecret: string;
  adminInitPassword?: string;
  webDist?: string;
  nodeEnv: NodeEnv;
  corsOrigin: string;
}

export const MAX_BODY_BYTES = 50 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_BYTES = 1024 * 1024;

const DEFAULT_PORT = 3001;
const DEFAULT_DATA_DIR = './data';
const DEFAULT_CORS_ORIGIN = 'http://localhost:3000';

function toSqliteUrl(filePath: string): string {
  return `file:${path.resolve(filePath).replace(/\\/g, '/')}`;
}

function parsePort(raw: string | undefined): number {
  if (!raw) return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT 配置无效: ${raw}`);
  }
  return port;
}

function parseNodeEnv(raw: string | undefined): NodeEnv {
  if (raw === 'production' || raw === 'test') return raw;
  return 'development';
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const dataDir =
    overrides.dataDir ?? path.resolve(process.cwd(), process.env.DATA_DIR || DEFAULT_DATA_DIR);
  const databaseUrl =
    overrides.databaseUrl ??
    process.env.DATABASE_URL ??
    toSqliteUrl(path.join(dataDir, 'app.db'));
  const webDistRaw = overrides.webDist ?? process.env.WEB_DIST;
  const config: AppConfig = {
    port: overrides.port ?? parsePort(process.env.PORT),
    dataDir,
    databaseUrl,
    jwtSecret: overrides.jwtSecret ?? process.env.JWT_SECRET ?? '',
    adminInitPassword:
      (overrides.adminInitPassword ?? process.env.ADMIN_INIT_PASSWORD) || undefined,
    webDist: webDistRaw ? path.resolve(process.cwd(), webDistRaw) : undefined,
    nodeEnv: overrides.nodeEnv ?? parseNodeEnv(process.env.NODE_ENV),
    corsOrigin: overrides.corsOrigin ?? process.env.CORS_ORIGIN ?? DEFAULT_CORS_ORIGIN
  };

  if (!config.jwtSecret) {
    throw new Error('缺少 JWT_SECRET 环境变量，服务拒绝启动');
  }

  return config;
}
