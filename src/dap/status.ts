export interface DapStatusInfo {
  state: "off" | "running" | "error"
  detail?: string
}

// v1: DAP 仅状态位，预留 StatusProvider 接口
export function getDapStatus(): DapStatusInfo {
  return { state: "off", detail: "未连接" }
}
