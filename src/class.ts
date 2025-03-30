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

export class WebRTC {
  #options: Options
  #controller = new AbortController()
  #id?: string
  #connected: string[] = []
  #status: Status = 'pending'
  #iceConnectionState: RTCIceConnectionState = 'new'
  #signalingState: RTCSignalingState = 'stable'
  #connectionState: RTCPeerConnectionState = 'new'

  ws: WebSocket
  peer: RTCPeerConnection

  #sendMessage(data: WSMessageEvent) {
    this.ws.send(JSON.stringify(data))
  }

  async #onMessage(ev: MessageEvent) {
    try {
      const { type, payload } = JSON.parse(ev.data) as WSMessageEvent
      const { key, desc, candidate } = payload
      switch (type) {
        case 'register':
          this.#id = key
          this.#status = 'ready'
          this.#onReady()
          break
        case 'offer':{
          if (!desc || !key)
            return
          await this.peer.setRemoteDescription(desc)
          const answer = await this.peer.createAnswer()
          await this.peer.setLocalDescription(answer)
          this.#sendMessage({
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
          await this.peer.setRemoteDescription(desc)

          this.#sendMessage({
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
          this.#status = 'connected'
          if (!this.#connected.includes(key)) {
            this.#connected.push(key)
          }
          break
        case 'ice-candidate':
          if (!candidate)
            return
          try {
            await this.peer.addIceCandidate(candidate)
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

  #onIcecandidate(ev: RTCPeerConnectionIceEvent) {
    if (ev.candidate) {
      this.#sendMessage({
        type: 'ice-candidate',
        payload: {
          candidate: ev.candidate,
        },
      })
    }
  }

  #onReadyFn: (() => void) | null = null
  #onReady() {
    if (this.#onReadyFn && typeof this.#onReadyFn === 'function') {
      this.#onReadyFn()
    }
  }

  #onConnectionFn: ((ev: RTCDataChannelEvent) => void) | null = null
  #onConnection(ev: RTCDataChannelEvent) {
    if (this.#onConnectionFn && typeof this.#onConnectionFn === 'function') {
      this.#onConnectionFn(ev)
    }
  }

  #onConnectionStreamFn: ((ev: RTCTrackEvent) => void) | null = null
  #onConnectionStream(ev: RTCTrackEvent) {
    if (this.#onConnectionStreamFn && typeof this.#onConnectionStreamFn === 'function') {
      this.#onConnectionStreamFn(ev)
    }
  }

  constructor(options?: Options) {
    this.#options = {
      host: '127.0.0.1',
      port: 6789,
      path: '/_web-rtc',
      ...options,
    }
    const { host, port, path, protocols, ...rtcConfig } = this.#options
    this.ws = new WebSocket(`ws://${host}:${port}${path}`, protocols)
    this.ws.addEventListener('message', this.#onMessage, { signal: this.#controller.signal })
    this.peer = new RTCPeerConnection(rtcConfig)

    this.#iceConnectionState = this.peer.iceConnectionState
    this.#signalingState = this.peer.signalingState
    this.#connectionState = this.peer.connectionState

    this.peer.addEventListener('iceconnectionstatechange', () => {
      this.#iceConnectionState = this.peer.iceConnectionState
    }, { signal: this.#controller.signal })
    this.peer.addEventListener('signalingstatechange', () => {
      this.#signalingState = this.peer.signalingState
    }, { signal: this.#controller.signal })
    this.peer.addEventListener('connectionstatechange', () => {
      this.#connectionState = this.peer.connectionState
    }, { signal: this.#controller.signal })
    this.peer.addEventListener('icecandidate', this.#onIcecandidate, { signal: this.#controller.signal })
    this.peer.addEventListener('datachannel', this.#onConnection, { signal: this.#controller.signal })
    this.peer.addEventListener('track', this.#onConnectionStream, { signal: this.#controller.signal })
  }

  get id() {
    return this.#id
  }

  get connected() {
    return this.#connected
  }

  get status() {
    return this.#status
  }

  get iceConnectionState() {
    return this.#iceConnectionState
  }

  get signalingState() {
    return this.#signalingState
  }

  get connectionState() {
    return this.#connectionState
  }

  async connect(id: string, label = 'label') {
    const dataChannel = this.peer.createDataChannel(label)
    const offer = await this.peer.createOffer()
    await this.peer.setLocalDescription(offer)
    this.#sendMessage({
      type: 'offer',
      payload: {
        key: id,
        desc: offer,
      },
    })

    return dataChannel
  }

  async connectStream(id: string, stream: MediaStream) {
    stream.getTracks().forEach((track) => {
      this.peer.addTrack(track, stream)
    })
    const offer = await this.peer.createOffer()
    await this.peer.setLocalDescription(offer)
    this.#sendMessage({
      type: 'offer',
      payload: {
        key: id,
        desc: offer,
      },
    })
    return this.peer
  }

  onReady(fn: () => void) {
    this.#onReadyFn = fn
  }

  onConnection(fn: (ev: RTCDataChannelEvent) => void) {
    this.#onConnectionFn = fn
  }

  onConnectionStream(fn: (ev: RTCTrackEvent) => void) {
    this.#onConnectionStreamFn = fn
  }

  destroy() {
    this.#controller.abort()
    this.ws.close()
    this.peer.close()
  }
}
