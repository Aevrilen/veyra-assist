import type { StatisticsMainContext } from './context'

export class VersionUsageRecorder {
  constructor(private readonly context: StatisticsMainContext) {}

  async recordOnce() {
    // Veyra usage must not be counted as an upstream Akari installation.
    this.context.logger.info('Upstream usage reporting is disabled in Veyra Assist')
  }
}
