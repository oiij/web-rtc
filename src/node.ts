import type { WebSocket } from 'ws'
import { WebSocketServer } from 'ws'
import { createDebug, createId } from './utils'

interface Options {
  host?: string
  port?: number
  path?: string
  debug?: boolean
}
interface MessageEvent {
  type: 'register' | 'offer' | 'answer' | 'answer-ok' | 'ice-candidate'
  payload: {
    key?: string
    desc?: RTCSessionDescription
    candidate?: RTCIceCandidate
  }
}
function sendMessage(socket: WebSocket, data: MessageEvent) {
  socket.send(JSON.stringify(data))
}
export function createWebRTC(options?: Options) {
  const { host = '127.0.0.1', port = 6789, path = '/_web-rtc', debug = false } = options ?? {}
  const socketMap = new Map<string, WebSocket>()
  const debugLog = createDebug(debug)
  const server = new WebSocketServer({
    port,
    path,
  }, () => {
    debugLog(`web-rtc server start at http://${host}:${port}${path}`)
  })
  function getSocket(key?: string) {
    return key ? socketMap.get(key) : undefined
  }
  server.on('connection', (socket, request) => {
    const key = createId(request.headers['sec-websocket-key'])

    if (!key) {
      debugLog('sec-websocket-key not found')
      return
    }
    if (!socketMap.has(key)) {
      socketMap.set(key, socket)
    }
    sendMessage(socket, {
      type: 'register',
      payload: {
        key,
      },
    })
    debugLog(`socket connect ${key}`)
    socket.on('message', (dataRaw) => {
      try {
        const { type, payload } = JSON.parse(dataRaw.toString()) as MessageEvent
        const { key: targetKey, desc, candidate } = payload
        switch (type) {
          case 'offer':
            {
              const target = getSocket(targetKey)
              if (!target) {
                debugLog(`offer target not found ${targetKey}`)
                return
              }
              sendMessage(target, {
                type: 'offer',
                payload: {
                  key,
                  desc,
                },
              })
            }

            break
          case 'answer':
            {
              const target = getSocket(targetKey)
              if (!target) {
                debugLog(`answer targetIns not found ${targetKey}`)
                return
              }
              sendMessage(target, {
                type: 'answer',
                payload: {
                  key: targetKey,
                  desc,
                },
              })
            }

            break
          case 'answer-ok':
            {
              const target = getSocket(targetKey)
              if (!target) {
                debugLog(`answer-ok targetIns not found ${targetKey}`)
                return
              }
              sendMessage(target, {
                type: 'answer-ok',
                payload: {
                  key,
                },
              })
            }
            break
          case 'ice-candidate':
            socketMap.entries().forEach(([_key, _socket]) => {
              if (_key === key)
                return
              sendMessage(_socket, {
                type: 'ice-candidate',
                payload: {
                  key,
                  candidate,
                },
              })
            })
            break
          default:
            break
        }
      }
      catch (error: any) {
        debugLog(error.toString(), 'error')
      }
    })
    socket.on('close', () => {
      debugLog('socket close')
    })
  })
  server.on('error', (err) => {
    debugLog(err.message, 'error')
  })
}
createWebRTC({ debug: true })
