import {
  type AkariApiConfigResource,
  type AkariApiConfigResourceMap,
  type AkariApiLanguage,
  type AkariRelease,
  type AkariStatisticsRecordCreated,
  DEFAULT_AKARI_API_BASE_URL,
  DEFAULT_AKARI_API_LANGUAGE
} from '@shared/shards/akari-api'
import type { AxiosInstance, AxiosResponse } from 'axios'

import type { HttpApiRequestOptions } from '../request-options'

export class AkariApiHttpApiAxiosHelper {
  constructor(private _http: AxiosInstance) {
    if (!_http.defaults.baseURL) {
      _http.defaults.baseURL = DEFAULT_AKARI_API_BASE_URL
    }
  }

  getConfig<Resource extends AkariApiConfigResource>(
    resource: Resource,
    options: HttpApiRequestOptions = {}
  ) {
    return this._http.get<AkariApiConfigResourceMap[Resource]>(`/config/v1/${resource}`, {
      signal: options.signal
    })
  }

  getLatestRelease(
    _language: AkariApiLanguage = DEFAULT_AKARI_API_LANGUAGE,
    _options: HttpApiRequestOptions = {}
  ) {
    return Promise.reject<AxiosResponse<AkariRelease>>(
      new Error('Upstream release checks are disabled in Veyra Assist')
    )
  }

  postStatisticsRecord(_version: string, _options: HttpApiRequestOptions = {}) {
    return Promise.reject<AxiosResponse<AkariStatisticsRecordCreated>>(
      new Error('Upstream usage reporting is disabled in Veyra Assist')
    )
  }
}
