import { describe, expect, it } from 'vitest'

import { matchRapidOcrName, ocrLineRejection } from './ocr-contract'

describe('separate OCR score and exact-name contracts', () => {
  it('keeps Tesseract80 and experimental RapidOCR0.95 as separate scales', () => {
    expect(ocrLineRejection({ text: '夜狩', confidence: 79 })).toBe('low-confidence')
    expect(ocrLineRejection({ text: '夜狩', confidence: 80 })).toBeNull()
    expect(ocrLineRejection({ backend: 'rapidocr', text: '夜狩', rawScore: 0.94999 })).toBe(
      'low-score'
    )
    expect(ocrLineRejection({ backend: 'rapidocr', text: '夜狩', rawScore: 0.95 })).toBeNull()
    expect(ocrLineRejection({ backend: 'rapidocr', text: '夜狩', rawScore: 95 })).toBe(
      'invalid-score'
    )
    expect(
      ocrLineRejection({
        backend: 'rapidocr',
        text: '',
        rawScore: null,
        inputRejection: 'truncated-title'
      })
    ).toBe('truncated-title')
  })
  it.each([NaN, Infinity, -0.1, 1.1, null])('rejects invalid raw scores: %s', (rawScore) => {
    expect(ocrLineRejection({ backend: 'rapidocr', text: '夜狩', rawScore })).toBe('invalid-score')
  })
  it('requires unique exact titles while normalizing only NFKC and whitespace', () => {
    const dictionary = [
      { id: 1, name: '夜狩' },
      { id: 2, name: '由暴生急' },
      { id: 3, name: '点亮他们!' },
      { id: 4, name: '黎明使者的坚决' }
    ]
    expect(matchRapidOcrName('夜 狩', dictionary)).toBe(1)
    expect(matchRapidOcrName('点亮他们！', dictionary)).toBe(3)
    for (const unknown of ['由暴生和急', '廣由暴生急', '#夜狩#', '一、黎明使者的坚决', '未知标题'])
      expect(matchRapidOcrName(unknown, dictionary)).toBeNull()
    expect(
      matchRapidOcrName('点亮他们！', [...dictionary, { id: 5, name: '点亮他们！' }])
    ).toBeNull()
  })
})
