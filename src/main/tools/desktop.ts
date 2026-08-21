// ============================================================
// 桌面控制工具集 — 单一原子工具 `desktop`（对齐 Claude computer-use 模式）
//
// 设计要点（参考 Anthropic computer-use / Open Interpreter / UI-TARS）：
// 1. 单一工具 + action 枚举：click/drag 一步完成"移动+点击"，
//    不再需要 move → screenshot → click 的多轮交互。
// 2. 坐标空间契约：LLM 输出的坐标 = 它上次看到的 screenshot 图像上的像素，
//    物理屏幕像素的换算由本模块完成（HiDPI 缩放下模型无法准确输出物理坐标，
//    这是"挪不到位"的根因）。
// 3. 截图固定缩放到 ≤1280px 宽（对齐 vision 模型舒适区，省 token），
//    并在文本中同时报告图像尺寸与物理屏幕尺寸。
// 4. 动作类 action 可带 after=true，执行后自动附带一张新截图，
//    省掉模型"动作→截图确认"的额外回合。
// 5. 输入/截图都走 robotjs（moveMouse/mouseClick/keyTap/screen.capture）。
//    截图的缩放+PNG 编码在 desktopImage.ts（纯 JS，可单测）。
// ============================================================
import robot from 'robotjs'
import type { ToolHandler } from './registry'
import { resizeBgraToPngBase64, type RawBgraImage } from './desktopImage'

export const DESKTOP_TOOL_NAME = 'desktop'

/** 上一次截图的图像尺寸。LLM 坐标以此为基准空间；未截图前默认 1:1。 */
let lastImageSize = { width: 0, height: 0 }

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================================
// 坐标换算
// ============================================================

/**
 * 缩放比例 = 物理屏幕 / 截图图像。
 * LLM 坐标（图像空间）× scale = 物理屏幕坐标。
 * 无截图记录时返回 1:1（hasReference=false，坐标按物理屏幕解释）。
 */
export function scaleFromImage(): { sx: number; sy: number; imgW: number; imgH: number; hasReference: boolean } {
  const screen = robot.getScreenSize()
  if (!lastImageSize.width || !lastImageSize.height) {
    return { sx: 1, sy: 1, imgW: screen.width, imgH: screen.height, hasReference: false }
  }
  return {
    sx: screen.width / lastImageSize.width,
    sy: screen.height / lastImageSize.height,
    imgW: lastImageSize.width,
    imgH: lastImageSize.height,
    hasReference: true
  }
}

/** 图像空间坐标 → 物理屏幕坐标 */
export function mapImageToScreen(x: number, y: number): { x: number; y: number } {
  const s = scaleFromImage()
  return { x: Math.round(x * s.sx), y: Math.round(y * s.sy) }
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** 截图元信息文本（与图像一起返回，告知 LLM 坐标空间） */
function screenshotMeta(width: number, height: number): string {
  const screen = robot.getScreenSize()
  const same = screen.width === width && screen.height === height
  return `Screenshot: image ${width}x${height}px, physical screen ${screen.width}x${screen.height}px.${
    same
      ? ''
      : ' IMPORTANT: all action coordinates (click/drag/scroll) must be in THIS image\'s pixel space — the agent scales them to the physical screen automatically.'
  }`
}

/** 截图 → 缩放 → base64，并更新坐标基准 */
function captureAndResize(img: RawBgraImage): { base64: string; width: number; height: number } {
  const r = resizeBgraToPngBase64(img)
  lastImageSize = { width: r.width, height: r.height }
  return r
}

/** 执行动作后附带新截图（after=true 时使用） */
async function withAfterScreenshot(text: string): Promise<string> {
  await sleep(50) // 给 UI 一点渲染时间
  const { base64, width, height } = captureAndResize(robot.screen.capture())
  return `${text}\n__IMAGE_BASE64__:${base64}\n${screenshotMeta(width, height)}`
}

// ============================================================
// 工具定义
// ============================================================

export const desktopTool: ToolHandler = {
  definition: {
    type: 'function',
    function: {
      name: DESKTOP_TOOL_NAME,
      description:
        'Control the user\'s desktop (mouse, keyboard, screen). ' +
        'COORDINATE RULE: the x,y of click/drag/scroll actions are PIXELS IN THE LAST SCREENSHOT IMAGE you received ' +
        '(not physical screen pixels — scaling to the real screen is handled automatically). ' +
        'If you have not seen a screenshot yet, call action="screenshot" first. ' +
        'Every action is atomic: a click moves the cursor and clicks in one step. ' +
        'Set after=true on an action to get a fresh screenshot confirming the result without an extra call ' +
        '(the new image then becomes the reference for your next coordinates).',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['screenshot', 'left_click', 'right_click', 'middle_click', 'double_click', 'drag', 'scroll', 'type', 'key'],
            description:
              'screenshot: capture the screen (returns an image). ' +
              'left_click/right_click/middle_click/double_click: move to (x,y) in image pixels and click. ' +
              'drag: press at (x,y), move to (end_x,end_y), release. ' +
              'scroll: scroll by (scroll_x,scroll_y) at current cursor, or at (x,y) if provided. ' +
              'type: type `text` at the current text cursor. ' +
              'key: press a key or shortcut (key + modifiers).'
          },
          x: { type: 'number', description: 'X in LAST SCREENSHOT image pixels (0 = left edge). Required for clicks/double_click/drag start; optional for scroll.' },
          y: { type: 'number', description: 'Y in LAST SCREENSHOT image pixels (0 = top edge). Required for clicks/double_click/drag start; optional for scroll.' },
          end_x: { type: 'number', description: 'drag only: end X in screenshot image pixels (required for drag).' },
          end_y: { type: 'number', description: 'drag only: end Y in screenshot image pixels (required for drag).' },
          button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'drag only: button to hold (default left).' },
          scroll_x: { type: 'number', description: 'scroll only: horizontal amount, positive = right (default 0).' },
          scroll_y: { type: 'number', description: 'scroll only: vertical amount, positive = down (required for scroll).' },
          text: { type: 'string', description: 'type only: text to type (ASCII and Unicode supported).' },
          key: { type: 'string', description: 'key only: "enter", "tab", "escape", "backspace", "delete", "space", "up", "down", "left", "right", "home", "end", "pageup", "pagedown", "f1"-"f24", "printscreen", "insert", or a single character like "a" or "1".' },
          modifiers: {
            type: 'array',
            items: { type: 'string', enum: ['alt', 'control', 'shift', 'command'] },
            description: 'key only: modifiers held with the key (e.g. copy = key "c" + modifiers ["control"]).'
          },
          after: {
            type: 'boolean',
            description:
              'Any action: if true, a fresh screenshot is attached to the result so you can verify the outcome. ' +
              'Default false. Use after clicks/typing when the result must be confirmed; skip it when the effect is predictable to save context.'
          }
        },
        required: ['action']
      }
    }
  },
  permission: 'normal',
  async execute(args) {
    const action = args.action as string
    const after = args.after === true
    const wantAfter = (text: string): Promise<string> => (after ? withAfterScreenshot(text) : Promise.resolve(text))

    // ---- 坐标类动作公共校验：必须落在上次截图图像范围内 ----
    const checkPoint = (msg: string): { x: number; y: number } | string => {
      if (!isFiniteNum(args.x) || !isFiniteNum(args.y)) return msg
      if (args.x < 0 || args.y < 0) return `Invalid coordinates (${args.x}, ${args.y}): must be >= 0.`
      const s = scaleFromImage()
      if (args.x > s.imgW + 0.5 || args.y > s.imgH + 0.5) {
        return `Invalid coordinates (${args.x}, ${args.y}): outside the last screenshot image (${s.imgW}x${s.imgH}). Take a fresh screenshot and use coordinates within it.`
      }
      return { x: args.x, y: args.y }
    }
    const noReferenceHint =
      '\nNote: no screenshot has been taken yet in this session, so coordinates were interpreted as PHYSICAL screen pixels. For reliable targeting, take a screenshot first and use coordinates from that image.'

    if (action === 'screenshot') {
      const { base64, width, height } = captureAndResize(robot.screen.capture())
      return `__IMAGE_BASE64__:${base64}\n${screenshotMeta(width, height)}`
    }

    switch (action) {
      case 'left_click':
      case 'right_click':
      case 'middle_click':
      case 'double_click': {
        const pt = checkPoint(`Missing or invalid x/y for ${action}. Provide coordinates in the last screenshot image's pixels.`)
        if (typeof pt === 'string') return pt
        const button = action === 'right_click' ? 'right' : action === 'middle_click' ? 'middle' : 'left'
        const double = action === 'double_click'
        const p = mapImageToScreen(pt.x, pt.y)
        const s = scaleFromImage()
        const screen = robot.getScreenSize()
        robot.moveMouse(p.x, p.y)
        robot.mouseClick(button, double)
        return wantAfter(
          `${double ? 'Double-' : ''}Clicked ${button} at image (${Math.round(pt.x)}, ${Math.round(pt.y)}) → screen (${p.x}, ${p.y}) [image ${s.imgW}x${s.imgH}, screen ${screen.width}x${screen.height}]${
            s.hasReference ? '' : noReferenceHint
          }`
        )
      }

      case 'drag': {
        const start = checkPoint('Missing or invalid x/y (drag start). Provide coordinates in the last screenshot image\'s pixels.')
        if (typeof start === 'string') return start
        if (!isFiniteNum(args.end_x) || !isFiniteNum(args.end_y)) {
          return 'Missing or invalid end_x/end_y for drag. Provide end coordinates in the last screenshot image\'s pixels.'
        }
        const s0 = scaleFromImage()
        if (args.end_x > s0.imgW + 0.5 || args.end_y > s0.imgH + 0.5) {
          return `Invalid drag end (${args.end_x}, ${args.end_y}): outside the last screenshot image (${s0.imgW}x${s0.imgH}).`
        }
        const button = (args.button as 'left' | 'right' | 'middle') || 'left'
        const from = mapImageToScreen(start.x, start.y)
        const to = mapImageToScreen(args.end_x, args.end_y)
        robot.moveMouse(from.x, from.y)
        robot.mouseToggle('down', button)
        await sleep(50)
        // 拖拽用平滑移动：保证中间路径被 UI 识别为 drag（瞬时传送可能丢失 drag 语义），
        // 速度 4000px/s，跨屏最多 ~0.5s
        robot.moveMouseSmooth(to.x, to.y, 4000)
        await sleep(60)
        robot.mouseToggle('up', button)
        return wantAfter(
          `Dragged ${button} from image (${Math.round(start.x)}, ${Math.round(start.y)}) to image (${Math.round(args.end_x)}, ${Math.round(args.end_y)}) → screen (${from.x}, ${from.y}) to (${to.x}, ${to.y})${
            s0.hasReference ? '' : noReferenceHint
          }`
        )
      }

      case 'scroll': {
        if (!isFiniteNum(args.scroll_y)) return 'Missing scroll_y for scroll. Positive = down.'
        const sx = Math.round(isFiniteNum(args.scroll_x) ? args.scroll_x : 0)
        const sy = Math.round(args.scroll_y)
        if (Math.abs(sx) > 500 || Math.abs(sy) > 500) return 'Scroll amounts too large (max ±500 per call).'
        if (isFiniteNum(args.x) && isFiniteNum(args.y)) {
          const s = scaleFromImage()
          if (args.x > s.imgW + 0.5 || args.y > s.imgH + 0.5) {
            return `Invalid coordinates (${args.x}, ${args.y}): outside the last screenshot image (${s.imgW}x${s.imgH}).`
          }
          const p = mapImageToScreen(args.x, args.y)
          robot.moveMouse(p.x, p.y)
        }
        robot.scrollMouse(sx, sy)
        return wantAfter(`Scrolled (${sx}, ${sy}) at cursor position.`)
      }

      case 'type': {
        const text = args.text
        if (typeof text !== 'string' || text.length === 0) return 'Missing text for type.'
        robot.typeString(text)
        return wantAfter(`Typed ${text.length} characters: "${text.length > 80 ? text.slice(0, 80) + '…' : text}"`)
      }

      case 'key': {
        const key = args.key as string
        if (!key) return 'Missing key for key action.'
        const mods = Array.isArray(args.modifiers) ? (args.modifiers as string[]) : []
        const validMods = ['alt', 'control', 'shift', 'command']
        for (const m of mods) {
          if (!validMods.includes(m)) return `Invalid modifier "${m}". Valid: ${validMods.join(', ')}.`
        }
        robot.keyTap(key, mods.length > 1 ? mods : mods[0])
        return wantAfter(`Pressed key: ${key}${mods.length > 0 ? ' + ' + mods.join('+') : ''}`)
      }

      default:
        return `Unknown action "${action}". Valid: screenshot, left_click, right_click, middle_click, double_click, drag, scroll, type, key.`
    }
  }
}

// ============================================================
// 导出（ipc/index.ts 按 { name, handler } 数组注册）
// ============================================================
export const desktopTools: { name: string; handler: ToolHandler }[] = [
  { name: DESKTOP_TOOL_NAME, handler: desktopTool }
]
