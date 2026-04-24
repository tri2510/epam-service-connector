// Copyright (c) 2026 Eclipse Foundation.
// SPDX-License-Identifier: MIT

import { io as ioClient } from 'socket.io-client'
import type { VSSPath, SignalUpdate } from '../types'

type SignalCallback = (path: VSSPath, value: number | null, ts: number) => void
type StatusCallback = (connected: boolean) => void
type LogCallback = (msg: string) => void

export class SignalService {
  private socket: any = null
  private isConnected = false
  private onSignal: SignalCallback | null = null
  private onStatus: StatusCallback | null = null
  private onLog: LogCallback | null = null

  constructor(
    private kitManagerUrl: string = 'https://kit.digitalauto.tech'
  ) {}

  setCallbacks(opts: {
    onSignal?: SignalCallback
    onStatus?: StatusCallback
    onLog?: LogCallback
  }) {
    if (opts.onSignal) this.onSignal = opts.onSignal
    if (opts.onStatus) this.onStatus = opts.onStatus
    if (opts.onLog) this.onLog = opts.onLog
  }

  private log(msg: string) {
    if (this.onLog) this.onLog(msg)
  }

  connect(instanceId: string): void {
    if (this.socket) { this.socket.disconnect(); this.socket = null }

    this.log('Connecting to ' + this.kitManagerUrl + '...')
    this.onStatus?.(false)

    this.socket = ioClient(this.kitManagerUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 3000,
    })

    this.socket.on('connect', () => {
      this.isConnected = true
      this.onStatus?.(true)
      this.log('Connected to Kit Manager')

      const reqId = 'dash-' + Date.now()
      this.socket.emit('messageToKit', {
        id: reqId,
        cmd: 'aos_signal_stream',
        to_kit_id: instanceId,
        type: 'aos_signal_stream',
        limit: 100,
      })
    })

    this.socket.on('disconnect', () => {
      this.isConnected = false
      this.onStatus?.(false)
      this.log('Disconnected')
    })

    this.socket.on('connect_error', (err: any) => {
      this.log('Connection error: ' + err.message)
    })

    this.socket.on('broadcastToClient', (msg: any) => {
      if (msg.type === 'signal-update' && msg.signal) {
        this.handleSignal(msg.signal, msg.value, msg.ts)
      }
    })

    this.socket.on('messageToKit-kitReply', (msg: any) => {
      if (msg.type === 'aos_signal_stream' && msg.signals) {
        msg.signals.forEach((s: any) => {
          this.handleSignal(s.signal, s.value, s.ts)
        })
        this.log('Loaded ' + msg.signals.length + ' historical signals')
      }
    })
  }

  private handleSignal(path: string, value: any, ts: number) {
    let v = parseFloat(value)
    if (isNaN(v)) v = value === 'true' ? 1 : (value === 'false' ? 0 : 0)
    this.onSignal?.(path as VSSPath, v, ts)
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
    this.isConnected = false
    this.onStatus?.(false)
  }

  connected(): boolean {
    return this.isConnected
  }
}
