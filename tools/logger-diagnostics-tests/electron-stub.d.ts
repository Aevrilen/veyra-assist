// Type-check boundary only: the immutable supplement excludes Electron/app closure.
export class BrowserWindow {
  static fromWebContents(contents: unknown): BrowserWindow | null
}
export const app: any
export const dialog: any
export const screen: any
export const shell: any
declare global {
  namespace NodeJS {
    interface Process {
      resourcesPath: string
    }
  }
}
