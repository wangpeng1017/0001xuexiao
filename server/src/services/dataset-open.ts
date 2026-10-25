import type { PrismaClient } from '@prisma/client';
import { fetchDataset } from './dataset-providers.js';
import { resolveDatasetForOpen } from './dataset.js';

const RATE_WINDOW_MS = 1000;
const RATE_LIMIT = 20;
const CACHE_TTL_MS = 2000;

interface RateEntry {
  start: number;
  count: number;
}

interface CacheEntry {
  expiresAt: number;
  data: unknown;
}

export class DatasetOpenService {
  private readonly rates = new Map<string, RateEntry>();
  private readonly cache = new Map<string, CacheEntry>();

  checkRate(ip: string): boolean {
    const now = Date.now();
    if (this.rates.size > 5000) {
      for (const [key, entry] of this.rates) {
        if (now - entry.start >= RATE_WINDOW_MS) this.rates.delete(key);
      }
    }
    const entry = this.rates.get(ip);
    if (!entry || now - entry.start >= RATE_WINDOW_MS) {
      this.rates.set(ip, { start: now, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= RATE_LIMIT;
  }

  invalidate(id: string): void {
    this.cache.delete(id);
  }

  async getData(prisma: PrismaClient, jwtSecret: string, id: string): Promise<unknown> {
    const cached = this.cache.get(id);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    const { dataset, config } = await resolveDatasetForOpen(prisma, jwtSecret, id);
    const data = await fetchDataset(dataset.type, config);
    this.cache.set(id, { expiresAt: Date.now() + CACHE_TTL_MS, data });
    return data;
  }
}
