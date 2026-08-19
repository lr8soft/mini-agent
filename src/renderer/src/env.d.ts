// 渲染进程环境类型声明
import type { MiniAgentAPI } from '../../preload/index'

declare global {
  interface Window {
    api: MiniAgentAPI
  }
}

export {}
