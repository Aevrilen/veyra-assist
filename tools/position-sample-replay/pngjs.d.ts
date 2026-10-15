declare module 'pngjs' {
  export const PNG: {
    sync: {
      read(
        buffer: Buffer,
        options?: { checkCRC?: boolean }
      ): { width: number; height: number; data: Buffer }
      write(
        image: { width: number; height: number; data: Buffer },
        options?: Record<string, unknown>
      ): Buffer
    }
  }
}
