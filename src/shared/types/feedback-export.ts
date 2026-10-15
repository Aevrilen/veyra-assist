export type FeedbackExportResult =
  | { status: 'cancelled' | 'busy' }
  | { status: 'saved'; logFiles: number; limited: boolean; revealed: boolean }
