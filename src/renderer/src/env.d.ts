// 渲染进程环境类型声明
import type { ZhumoraAPI } from '../../preload/index'

declare global {
  interface Window {
    api: ZhumoraAPI
  }
}

export {}
