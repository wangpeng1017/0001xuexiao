import { http } from '@/api/http'
import { RequestHttpEnum } from '@/enums/httpEnum'
import type {
  DataFileItem,
  DatasetConfig,
  DatasetItem,
  DatasetType,
  FormatsResult
} from './types'

export const datasetListApi = (params: object) =>
  http(RequestHttpEnum.GET)<DatasetItem[]>('dataset/list', params)

export const datasetCreateApi = (data: { name: string; type: DatasetType; config: DatasetConfig }) =>
  http(RequestHttpEnum.POST)<{ id: string }>('dataset/create', data)

export const datasetEditApi = (data: { id: string; name?: string; config?: DatasetConfig }) =>
  http(RequestHttpEnum.POST)('dataset/edit', data)

export const datasetDeleteApi = (ids: string[]) =>
  http(RequestHttpEnum.DELETE)('dataset/delete', { ids: ids.join(',') })

export const datasetTestApi = (data: { id?: string; type?: DatasetType; config?: DatasetConfig }) =>
  http(RequestHttpEnum.POST)<unknown>('dataset/test', data)

export const dataFileListApi = (params: object) =>
  http(RequestHttpEnum.GET)<DataFileItem[]>('datafile/list', params)

export const dataFileDeleteApi = (ids: string[]) =>
  http(RequestHttpEnum.DELETE)('datafile/delete', { ids: ids.join(',') })

export const dataFileRetryApi = (data: { id: string; srs?: string }) =>
  http(RequestHttpEnum.POST)('datafile/retry', data)

export const dataFileFormatsApi = () =>
  http(RequestHttpEnum.GET)<FormatsResult>('datafile/formats')

export const datafileUploadInitApi = (data: { fileName: string; size: number }) =>
  http(RequestHttpEnum.POST)<{
    uploadId: string
    chunkSize: number
    uploadedChunks: number[]
  }>('datafile/upload/init', data)

export const datafileUploadCompleteApi = (data: { uploadId: string; srs?: string }) =>
  http(RequestHttpEnum.POST)<{ id: string }>('datafile/upload/complete', data)
