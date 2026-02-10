export {}

declare global {
  interface Window {
    loadPyodide?: (config: {
      indexURL: string
      stdout?: (message: string) => void
      stderr?: (message: string) => void
    }) => Promise<{
      registerJsModule: (name: string, module: Record<string, unknown>) => void
      runPythonAsync: (code: string) => Promise<unknown>
    }>
  }
}
