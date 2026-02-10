export type RuntimeEvent = {
  type: number
  key?: string
  unicode?: string
  button?: number
  pos?: [number, number]
}

export type DrawCommand =
  | { op: 'setCanvasSize'; width: number; height: number }
  | { op: 'clear'; color: unknown }
  | { op: 'fillRect'; x: number; y: number; w: number; h: number; color: unknown }
  | {
      op: 'drawRect'
      x: number
      y: number
      w: number
      h: number
      color: unknown
      width: number
      borderRadius: number
      borderTopLeftRadius: number
      borderTopRightRadius: number
      borderBottomLeftRadius: number
      borderBottomRightRadius: number
    }
  | { op: 'drawCircle'; x: number; y: number; r: number; color: unknown; width: number }
  | { op: 'drawLine'; x1: number; y1: number; x2: number; y2: number; color: unknown; width: number }
  | {
      op: 'drawText'
      text: string
      x: number
      y: number
      color: unknown
      size: number
      family: string
    }
  | {
      op: 'drawEllipse'
      x: number
      y: number
      w: number
      h: number
      color: unknown
      width: number
    }
  | { op: 'drawPolygon'; points: Array<[number, number]>; color: unknown; width: number }

export type WorkerInboundMessage =
  | { type: 'warmup' }
  | { type: 'setSharedInput'; buffer: SharedArrayBuffer }
  | { type: 'run'; code: string }
  | { type: 'stop' }
  | { type: 'clearCanvas'; color: unknown }
  | { type: 'setMouseButtons'; buttons: [number, number, number] }
  | { type: 'enqueueEvents'; events: RuntimeEvent[] }
  | { type: 'setMousePos'; pos: [number, number] }

export type WorkerOutboundMessage =
  | { type: 'status'; message: string }
  | { type: 'stdout'; message: string }
  | { type: 'stderr'; message: string }
  | { type: 'runtimeReady' }
  | { type: 'runStarted' }
  | { type: 'runDone' }
  | { type: 'runError'; message: string }
  | { type: 'drawBatch'; commands: DrawCommand[] }
