import type { OcrLine } from './ocr-executor'

export const RAPIDOCR_EXPERIMENTAL_MIN_SCORE = 0.95
export type OcrInputRejection = 'invalid-image' | 'empty-title' | 'truncated-title'
export interface RapidOcrLine {
  backend: 'rapidocr'
  text: string
  // CTC score, not Tesseract confidence or an estimated percentage accuracy.
  rawScore: number | null
  inputRejection?: OcrInputRejection
}
export type BackendOcrLine = OcrLine | RapidOcrLine
export interface MayhemBackendOcrEngine {
  readonly backend?: 'tesseract' | 'rapidocr'
  preload(): Promise<void>
  recognize(images: readonly Buffer[]): Promise<BackendOcrLine[]>
  // Recover the last timed-out request without replaying its images. False means
  // the failure is not recoverable; rejection means bounded recovery failed.
  recover?(): Promise<boolean>
  dispose(): void
  diagnostics?(): Record<string, unknown>
}

export function ocrLineRejection(line: BackendOcrLine) {
  if (line.backend === 'rapidocr') {
    if (line.inputRejection) return line.inputRejection
    if (
      line.rawScore === null ||
      !Number.isFinite(line.rawScore) ||
      line.rawScore < 0 ||
      line.rawScore > 1
    )
      return 'invalid-score'
    return line.rawScore < RAPIDOCR_EXPERIMENTAL_MIN_SCORE ? 'low-score' : null
  }
  if (!Number.isFinite(line.confidence) || line.confidence < 0 || line.confidence > 100)
    return 'invalid-confidence'
  return line.confidence < 80 ? 'low-confidence' : null
}

// Only NFKC and whitespace normalization. No added/deleted characters or per-name repair.
export function matchRapidOcrName(text: string, dictionary: Array<{ id: number; name: string }>) {
  const normalize = (name: string) => name.normalize('NFKC').replace(/\s/gu, '')
  const matches = dictionary.filter((entry) => normalize(entry.name) === normalize(text))
  return matches.length === 1 ? matches[0].id : null
}
