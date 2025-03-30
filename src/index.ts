import { onUnmounted, ref } from 'vue'

type Options = RTCConfiguration & {
  host?: string
  port?: number
  path?: string
  protocols?: string[]
}
type Status = 'pending' | 'ready' | 'connected' | 'closed'
interface WSMessageEvent {
  type: 'register' | 'offer' | 'answer' | 'answer-ok' | 'ice-candidate'
  payload: {
    key?: string
    desc?: RTCSessionDescriptionInit
    candidate?: RTCIceCandidate
  }
}

export function useWebRTC(options?: Options) {
  const { host = '127.0.0.1', port = 6789, path = '/_web-rtc', protocols = [], ...rtcConfig } = options ?? {}
  const controller = new AbortController()
  const id = ref<string>()
  const connected = ref<string[]>([])
  const status = ref<Status>('pending')
  const ws = new WebSocket(`ws://${host}:${port}${path}`, protocols)
  const peer = new RTCPeerConnection(rtcConfig)

  const iceConnectionState = ref<RTCIceConnectionState>(peer.iceConnectionState)
  const signalingState = ref<RTCSignalingState>(peer.signalingState)
  const connectionState = ref<RTCPeerConnectionState>(peer.connectionState)

  let onReadyFn: (() => void) | null = null
  function onReady() {
    if (onReadyFn && typeof onReadyFn === 'function') {
      onReadyFn()
    }
  }

  let onConnectionFn: ((ev: RTCDataChannelEvent) => void) | null = null
  function onConnection(ev: RTCDataChannelEvent) {
    if (onConnectionFn && typeof onConnectionFn === 'function') {
      onConnectionFn(ev)
    }
  }
  let onConnectionStreamFn: ((ev: RTCTrackEvent) => void) | null = null
  function onConnectionStream(ev: RTCTrackEvent) {
    if (onConnectionStreamFn && typeof onConnectionStreamFn === 'function') {
      onConnectionStreamFn(ev)
    }
  }
  function sendMessage(data: WSMessageEvent) {
    ws.send(JSON.stringify(data))
  }
  function onIcecandidate(ev: RTCPeerConnectionIceEvent) {
    if (ev.candidate) {
      sendMessage({
        type: 'ice-candidate',
        payload: {
          candidate: ev.candidate,
        },
      })
    }
  }
  async function onMessage(ev: MessageEvent) {
    try {
      const { type, payload } = JSON.parse(ev.data) as WSMessageEvent
      const { key, desc, candidate } = payload
      switch (type) {
        case 'register':
          id.value = key
          status.value = 'ready'
          onReady()
          break
        case 'offer':{
          if (!desc || !key)
            return
          await peer.setRemoteDescription(desc)
          const answer = await peer.createAnswer()
          await peer.setLocalDescription(answer)
          sendMessage({
            type: 'answer',
            payload: {
              key,
              desc: answer,
            },
          })
        }
          break
        case 'answer':
          if (!desc || !key)
            return
          await peer.setRemoteDescription(desc)

          sendMessage({
            type: 'answer-ok',
            payload: {
              key,
            },
          })

          break
        case 'answer-ok':
          if (!key) {
            return
          }
          status.value = 'connected'
          if (!connected.value.includes(key)) {
            connected.value.push(key)
          }
          break
        case 'ice-candidate':
          if (!candidate)
            return
          try {
            await peer.addIceCandidate(candidate)
          }
          catch (error) {
            console.error(error)
          }
          break
        default:
          break
      }
    }
    catch (error) {
      console.error(error)
    }
  }
  async function connect(id: string, label = 'label') {
    const dataChannel = peer.createDataChannel(label)
    const offer = await peer.createOffer()
    await peer.setLocalDescription(offer)
    sendMessage({
      type: 'offer',
      payload: {
        key: id,
        desc: offer,
      },
    })

    return dataChannel
  }
  async function connectStream(id: string, stream: MediaStream) {
    stream.getTracks().forEach((track) => {
      peer.addTrack(track, stream)
    })
    const offer = await peer.createOffer()
    await peer.setLocalDescription(offer)
    sendMessage({
      type: 'offer',
      payload: {
        key: id,
        desc: offer,
      },
    })
    return peer
  }

  ws.addEventListener('message', onMessage, { signal: controller.signal })

  peer.addEventListener('icecandidate', onIcecandidate, { signal: controller.signal })
  peer.addEventListener('iceconnectionstatechange', () => {
    iceConnectionState.value = peer.iceConnectionState
  }, { signal: controller.signal })
  peer.addEventListener('signalingstatechange', () => {
    signalingState.value = peer.signalingState
  }, { signal: controller.signal })
  peer.addEventListener('connectionstatechange', () => {
    connectionState.value = peer.connectionState
  }, { signal: controller.signal })
  peer.addEventListener('datachannel', onConnection, { signal: controller.signal })
  peer.addEventListener('track', onConnectionStream, { signal: controller.signal })

  function destroy() {
    controller.abort()
    ws.close()
    peer.close()
  }

  onUnmounted(() => {
    destroy()
  })
  return {
    id,
    connected,
    status,
    ws,
    peer,
    signalingState,
    connectionState,
    onReady: (fn: () => void) => {
      onReadyFn = fn
    },
    connect,
    onConnection: (fn: (ev: RTCDataChannelEvent) => void) => {
      onConnectionFn = fn
    },
    connectStream,
    onConnectionStream: (fn: (ev: RTCTrackEvent) => void) => {
      onConnectionStreamFn = fn
    },
  }
}
