// ============================================================
// 桌面控制工具集 — RobotJS (鼠标/键盘) + Electron desktopCapturer (截屏)
// 工具: desktop_mouse_move / desktop_mouse_click / desktop_mouse_drag /
//       desktop_mouse_scroll / desktop_key_tap / desktop_type_text /
//       desktop_screenshot / desktop_screen_size / desktop_get_mouse_pos /
//       desktop_get_pixel_color
// ============================================================
import { desktopCapturer, screen as electronScreen } from 'electron'
import robot from 'robotjs'
import type { ToolHandler } from './registry'

// ============================================================
// 鼠标工具
// ============================================================

// ---- desktop_mouse_move ----
export const desktopMouseMoveTool: ToolHandler = {
  definition: {
    type: 'function',
    function: {
      name: 'desktop_mouse_move',
      description: 'Move the mouse cursor to the specified screen coordinates. Use smooth mode for visual feedback.',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'Target X coordinate (pixels, 0 = left edge)' },
          y: { type: 'number', description: 'Target Y coordinate (pixels, 0 = top edge)' },
          smooth: { type: 'boolean', description: 'If true, move smoothly with animation (default: false)' },
          speed: { type: 'number', description: 'Movement speed in pixels/second when smooth=true (default: 1000)' }
        },
        required: ['x', 'y']
      }
    }
  },
  permission: 'dangerous',
  async execute(args) {
    const x = Math.round(args.x as number)
    const y = Math.round(args.y as number)
    const smooth = (args.smooth as boolean) || false
    const speed = (args.speed as number) || 1000
    try {
      if (smooth) {
        // moveMouseSmooth(x, y, speed?) — speed is pixels per second
        robot.moveMouseSmooth(x, y, speed)
      } else {
        robot.moveMouse(x, y)
      }
      return `Mouse moved to (${x}, ${y})${smooth ? ' smoothly' : ''}`
    } catch (err) {
      return `Error moving mouse: ${(err as Error).message}`
    }
  }
}

// ---- desktop_mouse_click ----
export const desktopMouseClickTool: ToolHandler = {
  definition: {
    type: 'function',
    function: {
      name: 'desktop_mouse_click',
      description: 'Click the mouse at current position or at specified coordinates. Supports left/right/middle button and double-click.',
      parameters: {
        type: 'object',
        properties: {
          button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Mouse button (default: left)' },
          double: { type: 'boolean', description: 'If true, perform a double-click (default: false)' },
          x: { type: 'number', description: 'Optional X coordinate — if provided, mouse moves here before clicking' },
          y: { type: 'number', description: 'Optional Y coordinate — if provided, mouse moves here before clicking' }
        }
      }
    }
  },
  permission: 'dangerous',
  async execute(args) {
    const button = (args.button as 'left' | 'right' | 'middle') || 'left'
    const double = (args.double as boolean) || false
    const x = args.x !== undefined ? Math.round(args.x as number) : null
    const y = args.y !== undefined ? Math.round(args.y as number) : null
    try {
      if (x !== null && y !== null) {
        robot.moveMouse(x, y)
      }
      // mouseClick(button?, double?) — both params optional
      robot.mouseClick(button, double)
      const pos = robot.getMousePos()
      return `Clicked ${button}${double ? ' (double)' : ''} at (${pos.x}, ${pos.y})`
    } catch (err) {
      return `Error clicking mouse: ${(err as Error).message}`
    }
  }
}

// ---- desktop_mouse_drag ----
export const desktopMouseDragTool: ToolHandler = {
  definition: {
    type: 'function',
    function: {
      name: 'desktop_mouse_drag',
      description: 'Drag the mouse from current position to target coordinates with a button held down. Useful for drag-and-drop operations.',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'Target X coordinate to drag to' },
          y: { type: 'number', description: 'Target Y coordinate to drag to' },
          button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Button to hold during drag (default: left)' }
        },
        required: ['x', 'y']
      }
    }
  },
  permission: 'dangerous',
  async execute(args) {
    const x = Math.round(args.x as number)
    const y = Math.round(args.y as number)
    const button = (args.button as 'left' | 'right' | 'middle') || 'left'
    try {
      // dragMouse(x, y, button?) — drags from current pos to (x,y) with button pressed
      robot.dragMouse(x, y, button)
      return `Dragged mouse to (${x}, ${y}) with ${button} button`
    } catch (err) {
      return `Error dragging mouse: ${(err as Error).message}`
    }
  }
}

// ---- desktop_mouse_scroll ----
export const desktopMouseScrollTool: ToolHandler = {
  definition: {
    type: 'function',
    function: {
      name: 'desktop_mouse_scroll',
      description: 'Scroll the mouse wheel at the current position. Positive Y scrolls down, negative Y scrolls up. Positive X scrolls right, negative X scrolls left.',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'Horizontal scroll amount (positive=right, negative=left, 0=none)' },
          y: { type: 'number', description: 'Vertical scroll amount (positive=down, negative=up, 0=none)' }
        },
        required: ['y']
      }
    }
  },
  permission: 'dangerous',
  async execute(args) {
    const xAmt = Math.round(args.x as number) || 0
    const yAmt = Math.round(args.y as number)
    try {
      // scrollMouse(x, y) — horizontal and vertical scroll amounts
      robot.scrollMouse(xAmt, yAmt)
      return `Scrolled (x=${xAmt}, y=${yAmt})`
    } catch (err) {
      return `Error scrolling: ${(err as Error).message}`
    }
  }
}

// ============================================================
// 键盘工具
// ============================================================

// ---- desktop_key_tap ----
export const desktopKeyTapTool: ToolHandler = {
  definition: {
    type: 'function',
    function: {
      name: 'desktop_key_tap',
      description: 'Press and release a single key, optionally with modifier keys. Use for shortcuts (e.g. Ctrl+C, Alt+Tab) and special keys (enter, escape, f1, etc.).',
      parameters: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: 'Key name (e.g. "enter", "escape", "tab", "backspace", "delete", "space", "up", "down", "left", "right", "home", "end", "pageup", "pagedown", "f1"-"f24", "printscreen", "insert", or a single character like "a", "1")'
          },
          modifier: {
            description: 'Modifier key(s): "alt", "control", "shift", "command", or an array of these (e.g. ["control","shift"])',
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } }
            ]
          }
        },
        required: ['key']
      }
    }
  },
  permission: 'dangerous',
  async execute(args) {
    const key = args.key as string
    const modifier = args.modifier as string | string[] | undefined
    try {
      // keyTap(key, modifier?) — modifier can be string or string[]
      robot.keyTap(key, modifier as any)
      const modStr = modifier ? ` + ${Array.isArray(modifier) ? modifier.join('+') : modifier}` : ''
      return `Key pressed: ${key}${modStr}`
    } catch (err) {
      return `Error pressing key: ${(err as Error).message}`
    }
  }
}

// ---- desktop_type_text ----
export const desktopTypeTextTool: ToolHandler = {
  definition: {
    type: 'function',
    function: {
      name: 'desktop_type_text',
      description: 'Type a string of text at the current cursor position. Supports ASCII and Unicode characters. Set cpm for natural typing speed.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to type' },
          cpm: { type: 'number', description: 'Optional typing speed in characters per minute. If provided, types with natural random delays (e.g. 600=normal speed, 300=slow)' }
        },
        required: ['text']
      }
    }
  },
  permission: 'dangerous',
  async execute(args) {
    const text = args.text as string
    const cpm = args.cpm as number | undefined
    try {
      if (cpm && cpm > 0) {
        // typeStringDelayed(string, cpm) — natural typing with random delays
        robot.typeStringDelayed(text, Math.round(cpm))
        return `Typed "${text}" at ${cpm} CPM`
      } else {
        // typeString(string) — fast typing
        robot.typeString(text)
        return `Typed "${text}"`
      }
    } catch (err) {
      return `Error typing text: ${(err as Error).message}`
    }
  }
}

// ============================================================
// 屏幕工具
// ============================================================

// ---- desktop_screenshot ----
export const desktopScreenshotTool: ToolHandler = {
  definition: {
    type: 'function',
    function: {
      name: 'desktop_screenshot',
      description: 'Capture a screenshot of the entire screen or a specific screen/window. Returns a base64 PNG image for visual analysis. Use this to see what is currently on screen.',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            enum: ['screen', 'window'],
            description: 'Capture target: "screen" for entire screen (default), "window" for a specific window'
          },
          window_name: {
            type: 'string',
            description: 'When target=window, specify window title to capture. If omitted, captures the active window.'
          },
          max_width: {
            type: 'number',
            description: 'Maximum thumbnail width in pixels (default: screen width). Set smaller to reduce image size.'
          }
        }
      }
    }
  },
  permission: 'normal',
  async execute(args) {
    const target = (args.target as 'screen' | 'window') || 'screen'
    const windowName = args.window_name as string | undefined
    const maxWidth = args.max_width as number | undefined
    try {
      // Get screen dimensions for thumbnail size
      const screenSize = electronScreen.getPrimaryDisplay().size
      const thumbWidth = maxWidth && maxWidth > 0 ? maxWidth : screenSize.width
      const thumbHeight = Math.round(thumbWidth * (screenSize.height / screenSize.width))

      // desktopCapturer.getSources(options) — returns DesktopCapturerSource[]
      // Each source has: id, name, thumbnail (NativeImage), display_id
      const sources = await desktopCapturer.getSources({
        types: [target],
        thumbnailSize: { width: thumbWidth, height: thumbHeight },
        fetchWindowIcons: false
      })

      if (sources.length === 0) {
        return `No ${target} sources found for screenshot.`
      }

      // Find the right source
      let source = sources[0]
      if (target === 'window' && windowName) {
        const found = sources.find(s =>
          s.name.toLowerCase().includes(windowName.toLowerCase())
        )
        if (found) source = found
      }

      // thumbnail.toDataURL() returns "data:image/png;base64,..."
      const dataUrl = source.thumbnail.toDataURL()
      const base64 = dataUrl.split(',')[1]

      if (!base64 || base64.length < 100) {
        return `Screenshot captured but image appears empty. Source: ${source.name}`
      }

      // 返回 __IMAGE_BASE64__ 前缀标记，runner 会将其转换为多模态 content part
      return `__IMAGE_BASE64__:${base64}`
    } catch (err) {
      return `Error capturing screenshot: ${(err as Error).message}`
    }
  }
}

// ---- desktop_screen_size ----
export const desktopScreenSizeTool: ToolHandler = {
  definition: {
    type: 'function',
    function: {
      name: 'desktop_screen_size',
      description: 'Get the primary screen resolution (width and height in pixels). Useful before moving mouse or capturing screenshots.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  permission: 'safe',
  async execute() {
    try {
      // getScreenSize() returns {width, height}
      const size = robot.getScreenSize()
      return `Screen size: ${size.width} x ${size.height} pixels`
    } catch (err) {
      return `Error getting screen size: ${(err as Error).message}`
    }
  }
}

// ---- desktop_get_mouse_pos ----
export const desktopGetMousePosTool: ToolHandler = {
  definition: {
    type: 'function',
    function: {
      name: 'desktop_get_mouse_pos',
      description: 'Get the current mouse cursor position (x, y coordinates in pixels).',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  permission: 'safe',
  async execute() {
    try {
      // getMousePos() returns {x, y}
      const pos = robot.getMousePos()
      return `Mouse position: (${pos.x}, ${pos.y})`
    } catch (err) {
      return `Error getting mouse position: ${(err as Error).message}`
    }
  }
}

// ---- desktop_get_pixel_color ----
export const desktopGetPixelColorTool: ToolHandler = {
  definition: {
    type: 'function',
    function: {
      name: 'desktop_get_pixel_color',
      description: 'Get the color of a specific pixel on screen. Returns hex color string (e.g. "ff0000" for red).',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'X coordinate of the pixel' },
          y: { type: 'number', description: 'Y coordinate of the pixel' }
        },
        required: ['x', 'y']
      }
    }
  },
  permission: 'safe',
  async execute(args) {
    const x = Math.round(args.x as number)
    const y = Math.round(args.y as number)
    try {
      // getPixelColor(x, y) returns hex string (6 chars, lowercase, no #)
      const color = robot.getPixelColor(x, y)
      return `Pixel color at (${x}, ${y}): #${color}`
    } catch (err) {
      return `Error getting pixel color: ${(err as Error).message}`
    }
  }
}

// ============================================================
// 导出所有桌面控制工具
// ============================================================
export const desktopTools: { name: string; handler: ToolHandler }[] = [
  { name: 'desktop_mouse_move', handler: desktopMouseMoveTool },
  { name: 'desktop_mouse_click', handler: desktopMouseClickTool },
  { name: 'desktop_mouse_drag', handler: desktopMouseDragTool },
  { name: 'desktop_mouse_scroll', handler: desktopMouseScrollTool },
  { name: 'desktop_key_tap', handler: desktopKeyTapTool },
  { name: 'desktop_type_text', handler: desktopTypeTextTool },
  { name: 'desktop_screenshot', handler: desktopScreenshotTool },
  { name: 'desktop_screen_size', handler: desktopScreenSizeTool },
  { name: 'desktop_get_mouse_pos', handler: desktopGetMousePosTool },
  { name: 'desktop_get_pixel_color', handler: desktopGetPixelColorTool }
]
