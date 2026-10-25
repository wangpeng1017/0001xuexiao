import type { PrismaClient } from '@prisma/client';
import type { GeoTools } from '../lib/geo-tools.js';
import { convertDataFile } from './datafile-converters.js';
import { truncateError } from './datafile.js';

export interface DataFileQueue {
  enqueue: (id: string) => void;
  start: () => Promise<void>;
  stop: () => void;
  size: () => number;
}

export function createDataFileQueue(
  prisma: PrismaClient,
  dataDir: string,
  tools: GeoTools
): DataFileQueue {
  const waiting: string[] = [];
  let running = false;
  let stopped = false;
  const abort = new AbortController();

  const updateProgress = async (id: string, percent: number): Promise<void> => {
    try {
      await prisma.dataFile.update({ where: { id }, data: { progress: percent } });
    } catch {
      // 任务可能已被删除
    }
  };

  const processFile = async (id: string): Promise<void> => {
    const file = await prisma.dataFile.findUnique({ where: { id } });
    if (!file || stopped) return;
    try {
      await prisma.dataFile.update({
        where: { id },
        data: { status: 'converting', progress: 0, errorMsg: '' }
      });
    } catch {
      return;
    }

    let lastPercent = 0;
    let lastWrite = 0;
    const onProgress = (percent: number) => {
      const value = Math.max(0, Math.min(99, percent));
      if (value <= lastPercent) return;
      lastPercent = value;
      const now = Date.now();
      if (now - lastWrite < 800) return;
      lastWrite = now;
      void updateProgress(id, value);
    };

    try {
      const output = await convertDataFile({
        id,
        filePath: file.storedPath,
        fileName: file.name,
        dataDir,
        srs: file.srs ?? undefined,
        tools,
        onProgress,
        signal: abort.signal
      });
      await prisma.dataFile.update({
        where: { id },
        data: {
          kind: output.kind,
          outputUrl: output.outputUrl,
          status: 'success',
          progress: 100,
          errorMsg: ''
        }
      });
    } catch (error) {
      const message = truncateError(error instanceof Error ? error.message : String(error));
      try {
        await prisma.dataFile.update({
          where: { id },
          data: { status: 'failed', progress: 0, errorMsg: message }
        });
      } catch {
        // 任务可能已被删除
      }
    }
  };

  const pump = async (): Promise<void> => {
    if (running || stopped) return;
    const id = waiting.shift();
    if (!id) return;
    running = true;
    try {
      await processFile(id);
    } finally {
      running = false;
      if (!stopped) void pump();
    }
  };

  const enqueue = (id: string): void => {
    if (stopped || waiting.includes(id)) return;
    waiting.push(id);
    void pump();
  };

  const start = async (): Promise<void> => {
    stopped = false;
    const converting = await prisma.dataFile.findMany({
      where: { status: 'converting' },
      select: { id: true },
      orderBy: { createdAt: 'asc' }
    });
    if (converting.length > 0) {
      await prisma.dataFile.updateMany({
        where: { id: { in: converting.map((file) => file.id) } },
        data: { status: 'pending', progress: 0 }
      });
    }
    const pending = await prisma.dataFile.findMany({
      where: { status: 'pending' },
      select: { id: true },
      orderBy: { createdAt: 'asc' }
    });
    for (const file of [...converting, ...pending]) enqueue(file.id);
  };

  const stop = (): void => {
    stopped = true;
    waiting.length = 0;
    abort.abort();
  };

  return { enqueue, start, stop, size: () => waiting.length };
}
