// preload：暴露安全的 window.niuma API。
const { contextBridge, ipcRenderer } = require('electron')
const { IPC, EVENTS } = require('../shared/constants')

const api = {
  // 通用调用：invoke('ledger:start', args)
  invoke: (channel, args) => ipcRenderer.invoke(channel, args),
  // 事件订阅：返回取消函数
  on: (event, cb) => {
    const listener = (_e, payload) => cb(payload)
    ipcRenderer.on(event, listener)
    return () => ipcRenderer.removeListener(event, listener)
  },
  channels: IPC,
  events: EVENTS
}

contextBridge.exposeInMainWorld('niuma', api)
