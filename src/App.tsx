import { useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { python } from '@codemirror/lang-python'
import { oneDark } from '@codemirror/theme-one-dark'
import clsx from 'clsx'
import './App.css'
import { PythonCanvasRuntime } from './lib/pyRuntime'
import { SAMPLE_PROGRAMS, type SampleProgramId } from './lib/samples'

type ConsoleLine = {
  stream: 'stdout' | 'stderr' | 'system'
  text: string
}

function App() {
  const [selectedSample, setSelectedSample] = useState<SampleProgramId>('pygame')
  const [code, setCode] = useState<string>(SAMPLE_PROGRAMS.pygame)
  const [isRunning, setIsRunning] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [statusText, setStatusText] = useState('Idle')
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([
    { stream: 'system', text: 'Ready. Choose a sample or paste your Python code and press Play.' },
  ])

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const runtimeRef = useRef<PythonCanvasRuntime | null>(null)
  const isRuntimeBusy = useRef(false)
  const copyStateResetTimer = useRef<number | null>(null)

  const appendConsole = (line: ConsoleLine) => {
    setConsoleLines((prev) => [...prev, line].slice(-400))
  }

  useEffect(() => {
    const runtime = new PythonCanvasRuntime({
      onStdout: (message) => appendConsole({ stream: 'stdout', text: message }),
      onStderr: (message) => appendConsole({ stream: 'stderr', text: message }),
      onStatus: (message) => appendConsole({ stream: 'system', text: message }),
      onRunStart: () => {
        setIsStarting(false)
        setStatusText('Running...')
      },
    })
    runtimeRef.current = runtime
    setStatusText('Loading runtime...')
    runtime
      .warmup()
      .then(() => {
        setStatusText('Idle')
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        appendConsole({ stream: 'stderr', text: `Runtime warmup failed: ${message}` })
        setStatusText('Error')
      })
    return () => {
      runtime.destroy()
      if (runtimeRef.current === runtime) {
        runtimeRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (canvasRef.current && runtimeRef.current) {
      runtimeRef.current.attachCanvas(canvasRef.current)
    }
  }, [])

  const focusCanvas = () => {
    canvasRef.current?.focus()
  }

  const runCode = async () => {
    if (!runtimeRef.current || isRuntimeBusy.current) {
      return
    }
    focusCanvas()
    isRuntimeBusy.current = true
    setIsStarting(true)
    setIsRunning(true)
    setStatusText('Starting...')
    appendConsole({ stream: 'system', text: 'Starting script...' })
    try {
      await runtimeRef.current.run(code)
      appendConsole({ stream: 'system', text: 'Script finished successfully.' })
      setStatusText('Idle')
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error)
      if (rawMessage.includes('Execution stopped by user')) {
        appendConsole({ stream: 'system', text: 'Script stopped.' })
        setStatusText('Idle')
        return
      }
      const message = rawMessage.includes('Script terminated by timeout')
        ? 'Browser timeout: your script ran too long without yielding. Avoid endless while loops in this browser runtime (or cap frames), then rerun.'
        : rawMessage
      appendConsole({ stream: 'stderr', text: message })
      setStatusText('Error')
    } finally {
      setIsStarting(false)
      setIsRunning(false)
      isRuntimeBusy.current = false
    }
  }

  const stopCode = () => {
    runtimeRef.current?.requestStop()
    appendConsole({
      stream: 'system',
      text: 'Stop requested. Loops that poll pygame events or clock will halt soon.',
    })
    setStatusText('Stopping...')
  }

  const clearConsole = () => {
    setConsoleLines([])
  }

  const clearCanvas = () => {
    runtimeRef.current?.clearCanvas('black')
  }

  const resetCopyStateSoon = () => {
    if (copyStateResetTimer.current !== null) {
      window.clearTimeout(copyStateResetTimer.current)
    }
    copyStateResetTimer.current = window.setTimeout(() => {
      setCopyState('idle')
      copyStateResetTimer.current = null
    }, 1800)
  }

  const copyConsoleMessages = async () => {
    const messageText = consoleLines.map((line) => `[${line.stream}] ${line.text}`).join('\n')
    if (!messageText) {
      return
    }

    const fallbackCopy = () => {
      const textarea = document.createElement('textarea')
      textarea.value = messageText
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      document.body.appendChild(textarea)
      textarea.select()
      const wasCopied = document.execCommand('copy')
      document.body.removeChild(textarea)
      return wasCopied
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(messageText)
      } else if (!fallbackCopy()) {
        throw new Error('Copy fallback failed')
      }
      setCopyState('copied')
    } catch (_error) {
      setCopyState('failed')
    } finally {
      resetCopyStateSoon()
    }
  }

  const clearCode = () => {
    setCode('')
  }

  const applySample = (sampleId: SampleProgramId) => {
    setSelectedSample(sampleId)
    setCode(SAMPLE_PROGRAMS[sampleId])
  }

  const toggleFullscreen = async () => {
    if (!stageRef.current) return
    if (document.fullscreenElement) {
      await document.exitFullscreen()
      return
    }
    await stageRef.current.requestFullscreen()
    focusCanvas()
    if (!isRuntimeBusy.current) {
      void runCode()
    }
  }

  const consoleClassMap = useMemo(
    () => ({
      stdout: 'console-stdout',
      stderr: 'console-stderr',
      system: 'console-system',
    }),
    [],
  )

  useEffect(() => {
    return () => {
      if (copyStateResetTimer.current !== null) {
        window.clearTimeout(copyStateResetTimer.current)
      }
    }
  }, [])

  return (
    <div className="app-shell">
      <main className="workspace">
        <section className="panel editor-panel">
          <div className="panel-toolbar">
            <label className="control">
              <span>Sample</span>
              <select value={selectedSample} onChange={(event) => applySample(event.target.value as SampleProgramId)}>
                <option value="new_project">New Project</option>
                <option value="pygame">Neon Survivor</option>
                <option value="snake">Snake Game</option>
                <option value="platformer">Platformer</option>
                <option value="space_shooter">Space Shooter</option>
                <option value="puzzle">Sliding Puzzle</option>
                <option value="turtle">Turtle demo</option>
                <option value="dodge">Dodge</option>
              </select>
            </label>
            <div className="toolbar-buttons">
              <button onClick={clearCode}>Clear Code</button>
              <button onClick={clearCanvas}>Clear Canvas</button>
              <div className="run-controls">
                <button className="primary" onClick={isRunning ? stopCode : runCode}>
                  {isRunning ? 'Stop' : 'Play'}
                </button>
              </div>
            </div>
          </div>

          <div className="editor-wrapper">
            <CodeMirror
              value={code}
              theme={oneDark}
              extensions={[python()]}
              basicSetup={{
                lineNumbers: true,
                autocompletion: true,
                highlightActiveLine: true,
                foldGutter: true,
              }}
              onChange={setCode}
            />
          </div>
        </section>

        <section className="panel preview-panel">
          <div className="panel-toolbar">
            <h2>Output Window</h2>
            <div className="preview-toolbar-actions">
              <div className="status-pill">{statusText}</div>
              <button onClick={toggleFullscreen}>Fullscreen</button>
            </div>
          </div>
          <div className="stage" ref={stageRef} onMouseDown={focusCanvas} onTouchStart={focusCanvas}>
            <canvas ref={canvasRef} width={900} height={560} />
            {isStarting ? (
              <div className="stage-loading-overlay" aria-live="polite" aria-label="Loading game">
                <div className="loading-spinner" />
                <span>Loading game...</span>
              </div>
            ) : null}
          </div>
          <div className="console-shell">
            <div className="console-toolbar">
              <span>Console</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={clearConsole}>Clear Console</button>
                <button
                  className={clsx('copy-console-button', {
                    copied: copyState === 'copied',
                    failed: copyState === 'failed',
                  })}
                  disabled={consoleLines.length === 0}
                  onClick={() => void copyConsoleMessages()}
                >
                  {copyState === 'copied' ? 'Copied!' : copyState === 'failed' ? 'Copy failed' : 'Copy Messages'}
                </button>
              </div>
            </div>
            <div className="console">
              {consoleLines.length === 0 ? (
                <div className="console-empty">Console cleared.</div>
              ) : (
                consoleLines.map((line, index) => (
                  <div key={`${index}-${line.text}`} className={clsx('console-line', consoleClassMap[line.stream])}>
                    {line.text}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
