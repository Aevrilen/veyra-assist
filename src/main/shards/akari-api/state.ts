import type {
  AkariAutoSelectGroupsConfig,
  AkariFeatureGateSnapshot,
  AkariLeagueServersConfig,
  AkariRelease,
  AkariSupportedQueuesConfig
} from '@shared/shards/akari-api'
import { makeAutoObservable, observableRef } from 'mobx'

import {
  BUILTIN_AUTO_SELECT_GROUPS,
  BUILTIN_SGP_LEAGUE_SERVERS_CONFIG,
  BUILTIN_SUPPORTED_QUEUES
} from './builtin'

export class AkariApiState {
  featureGates: AkariFeatureGateSnapshot | null = null
  leagueServers = BUILTIN_SGP_LEAGUE_SERVERS_CONFIG
  supportedQueues = BUILTIN_SUPPORTED_QUEUES
  autoSelectGroups = BUILTIN_AUTO_SELECT_GROUPS

  latestRelease: AkariRelease | null = null

  setLatestRelease(value: AkariRelease | null) {
    this.latestRelease = value
  }

  isUpdatingLatestRelease = false
  isUpdatingFeatureGates = false
  isUpdatingLeagueServers = false
  isUpdatingSupportedQueues = false
  isUpdatingAutoSelectGroups = false

  setFeatureGates(value: AkariFeatureGateSnapshot) {
    this.featureGates = value
  }

  setLeagueServers(value: AkariLeagueServersConfig) {
    this.leagueServers = value
  }

  setSupportedQueues(value: AkariSupportedQueuesConfig) {
    this.supportedQueues = value
  }

  setAutoSelectGroups(value: AkariAutoSelectGroupsConfig) {
    this.autoSelectGroups = value
  }

  setUpdatingLatestRelease(value: boolean) {
    this.isUpdatingLatestRelease = value
  }

  setUpdatingFeatureGates(value: boolean) {
    this.isUpdatingFeatureGates = value
  }

  setUpdatingLeagueServers(value: boolean) {
    this.isUpdatingLeagueServers = value
  }

  setUpdatingSupportedQueues(value: boolean) {
    this.isUpdatingSupportedQueues = value
  }

  setUpdatingAutoSelectGroups(value: boolean) {
    this.isUpdatingAutoSelectGroups = value
  }

  constructor() {
    makeAutoObservable(this, {
      featureGates: observableRef,
      leagueServers: observableRef,
      supportedQueues: observableRef,
      autoSelectGroups: observableRef,
      latestRelease: observableRef
    })
  }
}
