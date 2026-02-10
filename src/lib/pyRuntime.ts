type ConsoleCallbacks = {
  onStdout: (message: string) => void
  onStderr: (message: string) => void
  onStatus: (message: string) => void
  onRunStart: () => void
}

import type {
  DrawCommand,
  WorkerInboundMessage,
  WorkerOutboundMessage,
} from './pyWorkerProtocol'
import {
  SHARED_INPUT_INDEX,
  SHARED_INPUT_SLOTS,
  SHARED_PYGAME_KEY_TO_SLOT,
} from './sharedInput'

const PYGAME_EVENT_TYPES = {
  QUIT: 256,
  KEYDOWN: 768,
  KEYUP: 769,
  MOUSEMOTION: 1024,
  MOUSEBUTTONDOWN: 1025,
  MOUSEBUTTONUP: 1026,
}

const MOUSE_MOVE_SAMPLE_MS = 16
const CODE_TO_PYGAME_KEY: Record<string, string> = {
  Escape: 'Escape',
  Space: ' ',
  Enter: 'Enter',
  NumpadEnter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  ControlLeft: 'Control',
  ControlRight: 'Control',
  AltLeft: 'Alt',
  AltRight: 'Alt',
  MetaLeft: 'Meta',
  MetaRight: 'Meta',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
}

const LEGACY_KEY_TO_PYGAME_KEY: Record<string, string> = {
  Spacebar: ' ',
  Space: ' ',
  Esc: 'Escape',
  Left: 'ArrowLeft',
  Right: 'ArrowRight',
  Up: 'ArrowUp',
  Down: 'ArrowDown',
  Del: 'Delete',
}

const normalizePygameKey = (event: KeyboardEvent): string => {
  const mapped = CODE_TO_PYGAME_KEY[event.code]
  if (mapped) return mapped

  if (event.code.startsWith('Key') && event.code.length === 4) {
    return event.code.slice(3).toLowerCase()
  }
  if (event.code.startsWith('Digit') && event.code.length === 6) {
    return event.code.slice(5)
  }
  if (event.code.startsWith('Numpad') && event.code.length === 7) {
    const maybeDigit = event.code.slice(6)
    if (/[0-9]/.test(maybeDigit)) return maybeDigit
  }

  const key = LEGACY_KEY_TO_PYGAME_KEY[event.key] ?? event.key
  if (key.length === 1) return key.toLowerCase()
  return key
}

const toUnicode = (event: KeyboardEvent): string => {
  // Pygame sets unicode to the produced character when possible.
  const key = LEGACY_KEY_TO_PYGAME_KEY[event.key] ?? event.key
  if (key === ' ') return ' '
  return key.length === 1 ? key : ''
}

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target.closest('.cm-editor')) return true
  const tagName = target.tagName.toUpperCase()
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT'
}

const toPygameMouseButton = (button: number): number => {
  // Browser MouseEvent.button is 0-based; pygame button values are 1-based.
  if (button === 0) return 1
  if (button === 1) return 2
  if (button === 2) return 3
  return Math.max(1, button)
}

const normalizeColor = (value: unknown): string => {
  if (typeof value === 'string') {
    return value
  }
  let candidate: unknown = value
  if (candidate && typeof candidate === 'object' && 'toJs' in candidate) {
    const withToJs = candidate as { toJs?: () => unknown }
    if (typeof withToJs.toJs === 'function') {
      candidate = withToJs.toJs()
    }
  }
  if (Array.isArray(candidate)) {
    const [r = 255, g = 255, b = 255, a = 1] = candidate
    if (candidate.length >= 4) {
      const alpha = typeof a === 'number' && a > 1 ? a / 255 : a
      return `rgba(${r}, ${g}, ${b}, ${alpha})`
    }
    return `rgb(${r}, ${g}, ${b})`
  }
  if (typeof candidate === 'number') {
    return `rgb(${candidate}, ${candidate}, ${candidate})`
  }
  return 'white'
}

export class PythonCanvasRuntime {
  private worker: Worker
  private sharedInputBuffer: SharedArrayBuffer | null = null
  private sharedInputView: Int32Array | null = null
  private warmupPromise: Promise<void> | null = null
  private runPromise: Promise<void> | null = null
  private resolveRun: (() => void) | null = null
  private rejectRun: ((error: Error) => void) | null = null
  private resolveWarmup: (() => void) | null = null
  private rejectWarmup: ((error: Error) => void) | null = null
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private callbacks: ConsoleCallbacks
  private listenersAttached = false
  private lastMouseMoveTs = 0
  private lastDispatchedKeyEventId: string | null = null
  private keydownHandler: ((event: KeyboardEvent) => void) | null = null
  private keyupHandler: ((event: KeyboardEvent) => void) | null = null
  private clickFocusHandler: (() => void) | null = null
  private contextMenuHandler: ((event: MouseEvent) => void) | null = null
  private visibilityChangeHandler: (() => void) | null = null
  private pendingCommands: DrawCommand[] = []
  private frameRequested = false

  constructor(callbacks: ConsoleCallbacks) {
    this.callbacks = callbacks
    if (typeof SharedArrayBuffer !== 'undefined') {
      try {
        this.sharedInputBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * SHARED_INPUT_SLOTS)
        this.sharedInputView = new Int32Array(this.sharedInputBuffer)
      } catch {
        this.sharedInputBuffer = null
        this.sharedInputView = null
      }
    }
    if (!this.sharedInputBuffer || !this.sharedInputView) {
      this.callbacks.onStatus('SharedArrayBuffer unavailable; using legacy input mode.')
    }
    this.worker = this.createWorker()
  }

  private createWorker(): Worker {
    const worker = new Worker(new URL('./python.worker.ts', import.meta.url))
    worker.onmessage = (event: MessageEvent<WorkerOutboundMessage>) => {
      this.handleWorkerMessage(event.data)
    }
    if (this.sharedInputBuffer) {
      try {
        worker.postMessage({ type: 'setSharedInput', buffer: this.sharedInputBuffer } satisfies WorkerInboundMessage)
      } catch {
        this.sharedInputBuffer = null
        this.sharedInputView = null
        this.callbacks.onStatus('Shared input setup failed; using legacy input mode.')
      }
    }
    return worker
  }

  private resetSharedInputState() {
    if (!this.sharedInputView) return
    this.sharedInputView.fill(0)
  }

  private setSharedMouse(pos: [number, number]) {
    if (!this.sharedInputView) return
    Atomics.store(this.sharedInputView, SHARED_INPUT_INDEX.mouseX, Math.round(pos[0]))
    Atomics.store(this.sharedInputView, SHARED_INPUT_INDEX.mouseY, Math.round(pos[1]))
  }

  private setSharedMouseButton(button: number, pressed: boolean) {
    if (!this.sharedInputView) return
    const idx =
      button === 0
        ? SHARED_INPUT_INDEX.mouseLeft
        : button === 1
          ? SHARED_INPUT_INDEX.mouseMiddle
          : button === 2
            ? SHARED_INPUT_INDEX.mouseRight
            : -1
    if (idx >= 0) {
      Atomics.store(this.sharedInputView, idx, pressed ? 1 : 0)
    }
  }

  private syncSharedMouseButtonsFromMask(buttonsMask: number) {
    // MouseEvent.buttons bitmask: 1=left, 2=right, 4=middle.
    this.setSharedMouseButton(0, (buttonsMask & 1) !== 0)
    this.setSharedMouseButton(1, (buttonsMask & 4) !== 0)
    this.setSharedMouseButton(2, (buttonsMask & 2) !== 0)
  }

  private postMouseButtonsFromMask(buttonsMask: number) {
    this.post({
      type: 'setMouseButtons',
      buttons: [(buttonsMask & 1) !== 0 ? 1 : 0, (buttonsMask & 4) !== 0 ? 1 : 0, (buttonsMask & 2) !== 0 ? 1 : 0],
    })
  }

  private setSharedKey(key: string, pressed: boolean) {
    if (!this.sharedInputView) return
    const slot = SHARED_PYGAME_KEY_TO_SLOT[key]
    if (slot == null) return
    Atomics.store(this.sharedInputView, slot, pressed ? 1 : 0)
  }

  attachCanvas(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const nextCtx = canvas.getContext('2d')
    if (!nextCtx) {
      throw new Error('Could not create 2D canvas context')
    }
    this.ctx = nextCtx
    this.clearCanvasLocal('rgb(0,0,0)')
    this.bindCanvasListeners()
  }

  requestStop() {
    this.post({ type: 'stop' })
    if (!this.runPromise && !this.warmupPromise) {
      return
    }
    this.interruptAndRestartWorker('Execution stopped by user')
  }

  destroy() {
    if (this.canvas) {
      if (this.clickFocusHandler) {
        this.canvas.removeEventListener('click', this.clickFocusHandler)
      }
      if (this.contextMenuHandler) {
        this.canvas.removeEventListener('contextmenu', this.contextMenuHandler)
      }
      if (this.keydownHandler) {
        this.canvas.removeEventListener('keydown', this.keydownHandler, { capture: true })
      }
      if (this.keyupHandler) {
        this.canvas.removeEventListener('keyup', this.keyupHandler, { capture: true })
      }
    }
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler, { capture: true })
      window.removeEventListener('keydown', this.keydownHandler, { capture: true })
    }
    if (this.keyupHandler) {
      document.removeEventListener('keyup', this.keyupHandler, { capture: true })
      window.removeEventListener('keyup', this.keyupHandler, { capture: true })
    }
    if (this.visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler)
    }
    this.listenersAttached = false
    this.worker.terminate()
  }

  clearCanvas(color: unknown = 'black') {
    this.clearCanvasLocal(color)
    this.post({ type: 'clearCanvas', color })
  }

  private clearCanvasLocal(color: unknown = 'black') {
    if (!this.canvas || !this.ctx) return
    this.ctx.fillStyle = normalizeColor(color)
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
  }

  private bindCanvasListeners() {
    if (!this.canvas || this.listenersAttached) {
      return
    }
    this.listenersAttached = true
    this.canvas.tabIndex = 0
    this.clickFocusHandler = () => this.canvas?.focus()
    this.contextMenuHandler = (event) => event.preventDefault()
    this.canvas.addEventListener('click', this.clickFocusHandler)
    this.canvas.addEventListener('contextmenu', this.contextMenuHandler)
    this.canvas.addEventListener('mousemove', (event) => {
      const now = performance.now()
      if (now - this.lastMouseMoveTs < MOUSE_MOVE_SAMPLE_MS) {
        return
      }
      this.lastMouseMoveTs = now
      const pos = this.getLocalMousePos(event)
      this.setSharedMouse(pos)
      this.syncSharedMouseButtonsFromMask(event.buttons)
      this.postMouseButtonsFromMask(event.buttons)
      if (!this.sharedInputView) {
        this.post({ type: 'setMousePos', pos })
        this.post({ type: 'enqueueEvents', events: [{ type: PYGAME_EVENT_TYPES.MOUSEMOTION, pos }] })
      }
    })
    this.canvas.addEventListener('mousedown', (event) => {
      event.preventDefault()
      const pos = this.getLocalMousePos(event)
      this.setSharedMouse(pos)
      this.setSharedMouseButton(event.button, true)
      this.postMouseButtonsFromMask(event.buttons)
      if (!this.sharedInputView) {
        this.post({ type: 'setMousePos', pos })
        this.post({
          type: 'enqueueEvents',
          events: [{ type: PYGAME_EVENT_TYPES.MOUSEBUTTONDOWN, button: toPygameMouseButton(event.button), pos }],
        })
      }
    })
    this.canvas.addEventListener('mouseup', (event) => {
      event.preventDefault()
      const pos = this.getLocalMousePos(event)
      this.setSharedMouse(pos)
      this.setSharedMouseButton(event.button, false)
      this.postMouseButtonsFromMask(event.buttons)
      if (!this.sharedInputView) {
        this.post({ type: 'setMousePos', pos })
        this.post({
          type: 'enqueueEvents',
          events: [{ type: PYGAME_EVENT_TYPES.MOUSEBUTTONUP, button: toPygameMouseButton(event.button), pos }],
        })
      }
    })
    this.canvas.addEventListener('mouseleave', () => {
      this.syncSharedMouseButtonsFromMask(0)
      this.postMouseButtonsFromMask(0)
    })
    window.addEventListener('blur', () => {
      this.syncSharedMouseButtonsFromMask(0)
      this.postMouseButtonsFromMask(0)
    })

    const forwardKey = (event: KeyboardEvent, isDown: boolean) => {
      if (isEditableTarget(event.target)) {
        return
      }
      const key = normalizePygameKey(event)
      const keyEventId = `${isDown ? 'd' : 'u'}:${event.timeStamp}:${event.code}:${key}:${event.repeat ? 1 : 0}`
      if (this.lastDispatchedKeyEventId === keyEventId) {
        return
      }
      this.lastDispatchedKeyEventId = keyEventId
      if (key === ' ' || key.startsWith('Arrow')) {
        event.preventDefault()
      }
      this.setSharedKey(key, isDown)
      if (isDown) {
        const unicode = toUnicode(event)
        if (!this.sharedInputView) {
          this.post({
            type: 'enqueueEvents',
            events: [{ type: PYGAME_EVENT_TYPES.KEYDOWN, key, unicode }],
          })
        }
      } else {
        if (!this.sharedInputView) {
          this.post({
            type: 'enqueueEvents',
            events: [{ type: PYGAME_EVENT_TYPES.KEYUP, key }],
          })
        }
      }
    }

    this.keydownHandler = (event: KeyboardEvent) => forwardKey(event, true)
    this.keyupHandler = (event: KeyboardEvent) => forwardKey(event, false)
    this.canvas.addEventListener('keydown', this.keydownHandler, { capture: true })
    this.canvas.addEventListener('keyup', this.keyupHandler, { capture: true })
    document.addEventListener('keydown', this.keydownHandler, { capture: true })
    document.addEventListener('keyup', this.keyupHandler, { capture: true })
    window.addEventListener('keydown', this.keydownHandler, { capture: true })
    window.addEventListener('keyup', this.keyupHandler, { capture: true })
    this.visibilityChangeHandler = () => {
      if (document.visibilityState === 'hidden') {
        if (this.sharedInputView) {
          Atomics.store(this.sharedInputView, SHARED_INPUT_INDEX.quitRequested, 1)
        } else {
          this.post({ type: 'enqueueEvents', events: [{ type: PYGAME_EVENT_TYPES.QUIT }] })
        }
      }
    }
    document.addEventListener('visibilitychange', this.visibilityChangeHandler)
  }

  private getLocalMousePos(event: MouseEvent): [number, number] {
    if (!this.canvas) return [0, 0]
    const rect = this.canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * this.canvas.width
    const y = ((event.clientY - rect.top) / rect.height) * this.canvas.height
    return [Math.round(x), Math.round(y)]
  }

  private post(message: WorkerInboundMessage) {
    this.worker.postMessage(message)
  }

  private interruptAndRestartWorker(reason: string) {
    const error = new Error(reason)
    if (this.rejectRun) {
      this.rejectRun(error)
    }
    if (this.rejectWarmup) {
      this.rejectWarmup(error)
    }
    this.resolveRun = null
    this.rejectRun = null
    this.runPromise = null
    this.resolveWarmup = null
    this.rejectWarmup = null
    this.warmupPromise = null
    this.pendingCommands = []
    this.frameRequested = false
    this.worker.terminate()
    this.worker = this.createWorker()
    this.callbacks.onStatus('Runtime restarted after stop request.')
    void this.warmup().catch((warmupError) => {
      const message = warmupError instanceof Error ? warmupError.message : String(warmupError)
      this.callbacks.onStderr(`Runtime warmup failed after stop: ${message}`)
    })
  }

  private handleWorkerMessage(message: WorkerOutboundMessage) {
    if (message.type === 'stdout') {
      this.callbacks.onStdout(message.message)
      return
    }
    if (message.type === 'stderr') {
      this.callbacks.onStderr(message.message)
      return
    }
    if (message.type === 'status') {
      this.callbacks.onStatus(message.message)
      return
    }
    if (message.type === 'runtimeReady') {
      this.resolveWarmup?.()
      this.resolveWarmup = null
      this.rejectWarmup = null
      this.warmupPromise = null
      return
    }
    if (message.type === 'runStarted') {
      this.callbacks.onRunStart()
      return
    }
    if (message.type === 'runDone') {
      this.resolveRun?.()
      this.resolveRun = null
      this.rejectRun = null
      this.runPromise = null
      return
    }
    if (message.type === 'runError') {
      const error = new Error(message.message)
      if (this.rejectRun) {
        this.rejectRun(error)
        this.resolveRun = null
        this.rejectRun = null
        this.runPromise = null
      } else if (this.rejectWarmup) {
        this.rejectWarmup(error)
        this.resolveWarmup = null
        this.rejectWarmup = null
        this.warmupPromise = null
      } else {
        this.callbacks.onStderr(message.message)
      }
      return
    }
    if (message.type === 'drawBatch') {
      this.pendingCommands.push(...message.commands)
      if (!this.frameRequested) {
        this.frameRequested = true
        requestAnimationFrame(() => this.flushCommands())
      }
    }
  }

  private buildRoundedRectPath(
    x: number,
    y: number,
    w: number,
    h: number,
    radius: {
      tl: number
      tr: number
      br: number
      bl: number
    },
  ) {
    if (!this.ctx) return
    this.ctx.beginPath()
    this.ctx.moveTo(x + radius.tl, y)
    this.ctx.lineTo(x + w - radius.tr, y)
    if (radius.tr > 0) {
      this.ctx.quadraticCurveTo(x + w, y, x + w, y + radius.tr)
    }
    this.ctx.lineTo(x + w, y + h - radius.br)
    if (radius.br > 0) {
      this.ctx.quadraticCurveTo(x + w, y + h, x + w - radius.br, y + h)
    }
    this.ctx.lineTo(x + radius.bl, y + h)
    if (radius.bl > 0) {
      this.ctx.quadraticCurveTo(x, y + h, x, y + h - radius.bl)
    }
    this.ctx.lineTo(x, y + radius.tl)
    if (radius.tl > 0) {
      this.ctx.quadraticCurveTo(x, y, x + radius.tl, y)
    }
    this.ctx.closePath()
  }

  private resolveRectRadii(cmd: Extract<DrawCommand, { op: 'drawRect' }>) {
    const x = cmd.w >= 0 ? cmd.x : cmd.x + cmd.w
    const y = cmd.h >= 0 ? cmd.y : cmd.y + cmd.h
    const w = Math.abs(cmd.w)
    const h = Math.abs(cmd.h)
    const defaultRadius = Math.max(0, cmd.borderRadius || 0)
    let tl = Math.max(0, cmd.borderTopLeftRadius >= 0 ? cmd.borderTopLeftRadius : defaultRadius)
    let tr = Math.max(0, cmd.borderTopRightRadius >= 0 ? cmd.borderTopRightRadius : defaultRadius)
    let br = Math.max(0, cmd.borderBottomRightRadius >= 0 ? cmd.borderBottomRightRadius : defaultRadius)
    let bl = Math.max(0, cmd.borderBottomLeftRadius >= 0 ? cmd.borderBottomLeftRadius : defaultRadius)

    // Match CSS/Canvas radius clamping so corners never overlap.
    const scale = Math.min(
      tl + tr > 0 ? w / (tl + tr) : 1,
      bl + br > 0 ? w / (bl + br) : 1,
      tl + bl > 0 ? h / (tl + bl) : 1,
      tr + br > 0 ? h / (tr + br) : 1,
      1,
    )
    if (scale < 1) {
      tl *= scale
      tr *= scale
      br *= scale
      bl *= scale
    }

    return { x, y, w, h, radius: { tl, tr, br, bl } }
  }

  private flushCommands() {
    this.frameRequested = false
    if (!this.ctx || !this.canvas || this.pendingCommands.length === 0) return
    const commands = this.pendingCommands
    this.pendingCommands = []

    for (const cmd of commands) {
      if (cmd.op === 'setCanvasSize') {
        if (this.canvas.width !== cmd.width) this.canvas.width = cmd.width
        if (this.canvas.height !== cmd.height) this.canvas.height = cmd.height
        continue
      }
      if (cmd.op === 'clear') {
        this.clearCanvasLocal(cmd.color)
        continue
      }
      if (cmd.op === 'fillRect') {
        this.ctx.fillStyle = normalizeColor(cmd.color)
        this.ctx.fillRect(cmd.x, cmd.y, cmd.w, cmd.h)
        continue
      }
      if (cmd.op === 'drawRect') {
        const rect = this.resolveRectRadii(cmd)
        const hasRoundedCorners =
          rect.radius.tl > 0 || rect.radius.tr > 0 || rect.radius.br > 0 || rect.radius.bl > 0
        if (cmd.width > 0) {
          this.ctx.strokeStyle = normalizeColor(cmd.color)
          this.ctx.lineWidth = cmd.width
          if (hasRoundedCorners) {
            this.buildRoundedRectPath(rect.x, rect.y, rect.w, rect.h, rect.radius)
            this.ctx.stroke()
          } else {
            this.ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)
          }
        } else {
          this.ctx.fillStyle = normalizeColor(cmd.color)
          if (hasRoundedCorners) {
            this.buildRoundedRectPath(rect.x, rect.y, rect.w, rect.h, rect.radius)
            this.ctx.fill()
          } else {
            this.ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
          }
        }
        continue
      }
      if (cmd.op === 'drawCircle') {
        this.ctx.beginPath()
        this.ctx.arc(cmd.x, cmd.y, cmd.r, 0, Math.PI * 2)
        if (cmd.width > 0) {
          this.ctx.strokeStyle = normalizeColor(cmd.color)
          this.ctx.lineWidth = cmd.width
          this.ctx.stroke()
        } else {
          this.ctx.fillStyle = normalizeColor(cmd.color)
          this.ctx.fill()
        }
        continue
      }
      if (cmd.op === 'drawLine') {
        this.ctx.beginPath()
        this.ctx.moveTo(cmd.x1, cmd.y1)
        this.ctx.lineTo(cmd.x2, cmd.y2)
        this.ctx.strokeStyle = normalizeColor(cmd.color)
        this.ctx.lineWidth = Math.max(1, cmd.width || 1)
        this.ctx.stroke()
        continue
      }
      if (cmd.op === 'drawText') {
        this.ctx.fillStyle = normalizeColor(cmd.color)
        this.ctx.font = `${Math.max(8, Math.floor(cmd.size))}px ${cmd.family || 'sans-serif'}`
        // pygame blits text surfaces from the top-left corner.
        this.ctx.textAlign = 'left'
        this.ctx.textBaseline = 'top'
        this.ctx.fillText(cmd.text, cmd.x, cmd.y)
        continue
      }
      if (cmd.op === 'drawEllipse') {
        this.ctx.beginPath()
        this.ctx.ellipse(cmd.x + cmd.w / 2, cmd.y + cmd.h / 2, Math.abs(cmd.w / 2), Math.abs(cmd.h / 2), 0, 0, Math.PI * 2)
        if (cmd.width > 0) {
          this.ctx.strokeStyle = normalizeColor(cmd.color)
          this.ctx.lineWidth = cmd.width
          this.ctx.stroke()
        } else {
          this.ctx.fillStyle = normalizeColor(cmd.color)
          this.ctx.fill()
        }
        continue
      }
      if (cmd.op === 'drawPolygon') {
        if (!cmd.points.length) continue
        this.ctx.beginPath()
        this.ctx.moveTo(cmd.points[0][0], cmd.points[0][1])
        for (let index = 1; index < cmd.points.length; index += 1) {
          this.ctx.lineTo(cmd.points[index][0], cmd.points[index][1])
        }
        this.ctx.closePath()
        if (cmd.width > 0) {
          this.ctx.strokeStyle = normalizeColor(cmd.color)
          this.ctx.lineWidth = cmd.width
          this.ctx.stroke()
        } else {
          this.ctx.fillStyle = normalizeColor(cmd.color)
          this.ctx.fill()
        }
      }
    }
  }

  async warmup() {
    if (this.warmupPromise) {
      return this.warmupPromise
    }
    this.warmupPromise = new Promise<void>((resolve, reject) => {
      this.resolveWarmup = resolve
      this.rejectWarmup = reject
      this.post({ type: 'warmup' })
    })
    return this.warmupPromise
  }

  async run(code: string) {
    if (this.runPromise) {
      throw new Error('Runtime is already running.')
    }
    this.resetSharedInputState()
    this.runPromise = new Promise<void>((resolve, reject) => {
      this.resolveRun = resolve
      this.rejectRun = reject
      this.post({ type: 'run', code })
    })
    return this.runPromise
  }
}
