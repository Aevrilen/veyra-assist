/**
 * Public UI contract. Values are display results supplied by a provider.
 * This module does not capture windows, run OCR, or infer card identities.
 * @typedef {{id: string, title: string, score: number} | null} Card
 * @typedef {{kind: 'mock', liveRecognition: false, status: 'unavailable' | 'ready', cards: Card[]}} RecognitionSnapshot
 */

/** An explicit, deterministic substitute for UI and interface development. */
export function createMockRecognitionProvider() {
  /** @type {RecognitionSnapshot} */
  let snapshot = {
    kind: 'mock',
    liveRecognition: false,
    status: 'unavailable',
    cards: [null, null, null]
  }

  return {
    /** @returns {RecognitionSnapshot} */
    getSnapshot: () => structuredClone(snapshot),
    showExample() {
      snapshot = {
        kind: 'mock',
        liveRecognition: false,
        status: 'ready',
        cards: [
          { id: 'example-a', title: 'Example A', score: 61 },
          { id: 'example-b', title: 'Example B', score: 54 },
          null
        ]
      }
    },
    reset() {
      snapshot = {
        kind: 'mock',
        liveRecognition: false,
        status: 'unavailable',
        cards: [null, null, null]
      }
    }
  }
}
