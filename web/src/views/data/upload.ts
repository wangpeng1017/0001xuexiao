import { useSystemStore } from '@/store/modules/systemStore/systemStore'
import { datafileUploadCompleteApi, datafileUploadInitApi } from './api'

const CONCURRENCY = 3

export interface UploadProgress {
  percent: number
  loaded: number
  speed: number
}

export interface UploadOptions {
  srs?: string
  onResumed?: (uploadedChunks: number, totalChunks: number) => void
  onProgress?: (progress: UploadProgress) => void
}

function authHeaders(): Record<string, string> {
  const info = useSystemStore().getUserInfo
  const name = info.tokenName || 'Authorization'
  const value = info.userToken || ''
  return value ? { [name]: value } : {}
}

function uploadChunkXhr(
  uploadId: string,
  index: number,
  chunk: Blob,
  onPartial: (loaded: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(
      'PUT',
      `/api/goview/datafile/upload/chunk?uploadId=${encodeURIComponent(uploadId)}&index=${index}`
    )
    for (const [key, value] of Object.entries(authHeaders())) {
      xhr.setRequestHeader(key, value)
    }
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onPartial(event.loaded)
    }
    xhr.onerror = () => reject(new Error('网络错误，上传中断，可重新选择同一文件续传'))
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText || '{}')
        if (body.code === 200) resolve()
        else reject(new Error(body.msg || '分片上传失败'))
      } catch {
        reject(new Error('分片上传响应解析失败'))
      }
    }
    xhr.send(chunk)
  })
}

export async function uploadFileInChunks(file: File, options: UploadOptions = {}): Promise<string> {
  if (!file.size) throw new Error('文件内容为空')
  const initResponse = await datafileUploadInitApi({ fileName: file.name, size: file.size })
  if (!initResponse || initResponse.code !== 200 || !initResponse.data) {
    throw new Error(initResponse?.msg || '初始化上传失败')
  }
  const { uploadId, chunkSize } = initResponse.data
  const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize))
  const uploaded = new Set(initResponse.data.uploadedChunks)

  const chunkLength = (index: number) =>
    index < totalChunks - 1 ? chunkSize : file.size - chunkSize * (totalChunks - 1)

  let bytesDone = 0
  for (const index of uploaded) bytesDone += chunkLength(index)
  if (uploaded.size > 0) options.onResumed?.(uploaded.size, totalChunks)

  const startedAt = Date.now()
  const startBytes = bytesDone
  const partials = new Map<number, number>()
  let lastReport = 0

  const report = (force = false) => {
    const now = Date.now()
    if (!force && now - lastReport < 200) return
    lastReport = now
    let partialBytes = 0
    for (const value of partials.values()) partialBytes += value
    const loaded = Math.min(file.size, bytesDone + partialBytes)
    const elapsed = Math.max(1, now - startedAt)
    const speed = Math.max(0, ((loaded - startBytes) / elapsed) * 1000)
    options.onProgress?.({
      percent: Math.min(99, Math.round((loaded / file.size) * 100)),
      loaded,
      speed
    })
  }
  report(true)

  const queue: number[] = []
  for (let index = 0; index < totalChunks; index += 1) {
    if (!uploaded.has(index)) queue.push(index)
  }

  const worker = async () => {
    for (;;) {
      const index = queue.shift()
      if (index === undefined) return
      const start = index * chunkSize
      const end = Math.min(start + chunkSize, file.size)
      const chunk = file.slice(start, end)
      await uploadChunkXhr(uploadId, index, chunk, (loaded) => {
        partials.set(index, Math.min(loaded, end - start))
        report()
      })
      partials.delete(index)
      bytesDone += end - start
      report(true)
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker()))
  } catch (error) {
    report(true)
    throw error
  }

  const completeResponse = await datafileUploadCompleteApi({ uploadId, srs: options.srs })
  if (!completeResponse || completeResponse.code !== 200 || !completeResponse.data) {
    throw new Error(completeResponse?.msg || '合并文件失败')
  }
  return completeResponse.data.id
}

export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond <= 0) return '0 B/s'
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  let value = bytesPerSecond
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}
