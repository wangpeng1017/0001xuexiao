import type { FastifyInstance } from 'fastify';
import { authHeaders, readJson, type ApiEnvelope } from './helpers.js';

export interface UploadResult {
  uploadId: string;
  fileId: string;
  chunkSize: number;
}

export async function uploadBuffer(
  app: FastifyInstance,
  token: string,
  fileName: string,
  buffer: Buffer,
  srs?: string
): Promise<UploadResult> {
  const initResponse = await app.inject({
    method: 'POST',
    url: '/api/goview/datafile/upload/init',
    headers: authHeaders(token),
    payload: { fileName, size: buffer.length }
  });
  const init = readJson<{
    uploadId: string;
    chunkSize: number;
    uploadedChunks: number[];
  }>(initResponse);
  if (init.code !== 200) throw new Error(`init 失败: ${initResponse.body}`);

  const { uploadId, chunkSize } = init.data;
  const uploaded = new Set(init.data.uploadedChunks);
  const totalChunks = Math.ceil(buffer.length / chunkSize);
  for (let index = 0; index < totalChunks; index += 1) {
    if (uploaded.has(index)) continue;
    const start = index * chunkSize;
    const chunk = buffer.subarray(start, Math.min(start + chunkSize, buffer.length));
    const chunkResponse = await app.inject({
      method: 'PUT',
      url: `/api/goview/datafile/upload/chunk?uploadId=${uploadId}&index=${index}`,
      headers: { ...authHeaders(token), 'content-type': 'application/octet-stream' },
      payload: chunk
    });
    const result = readJson<unknown>(chunkResponse);
    if (result.code !== 200) throw new Error(`分片 ${index} 上传失败: ${chunkResponse.body}`);
  }

  const completeResponse = await app.inject({
    method: 'POST',
    url: '/api/goview/datafile/upload/complete',
    headers: authHeaders(token),
    payload: { uploadId, srs }
  });
  const complete = readJson<{ id: string }>(completeResponse);
  if (complete.code !== 200) throw new Error(`complete 失败: ${completeResponse.body}`);
  return { uploadId, fileId: complete.data.id, chunkSize };
}

export interface DataFileDetail {
  id: string;
  name: string;
  kind: string;
  status: string;
  progress: number;
  errorMsg: string;
  outputUrl: string;
  originFormat: string;
  srs: string;
}

export async function getDataFile(
  app: FastifyInstance,
  token: string,
  id: string
): Promise<DataFileDetail> {
  const response = await app.inject({
    method: 'GET',
    url: `/api/goview/datafile/detail?id=${id}`,
    headers: authHeaders(token)
  });
  const body = readJson<DataFileDetail>(response);
  if (body.code !== 200) throw new Error(`detail 失败: ${response.body}`);
  return body.data;
}

export async function waitForDataFile(
  app: FastifyInstance,
  token: string,
  id: string,
  predicate: (file: DataFileDetail) => boolean,
  timeoutMs = 10_000
): Promise<DataFileDetail> {
  const deadline = Date.now() + timeoutMs;
  let latest: DataFileDetail | null = null;
  while (Date.now() < deadline) {
    latest = await getDataFile(app, token, id);
    if (predicate(latest)) return latest;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`等待数据文件状态超时: ${JSON.stringify(latest)}`);
}

export function envelope<T>(response: { body: string }): ApiEnvelope<T> {
  return readJson<T>(response);
}
