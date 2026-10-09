import { afterEach, describe, expect, it } from 'vitest'
import WebSocket, { WebSocketServer } from 'ws'
import { InstaboxTunnelProxy } from './instabox-tunnel-proxy'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup()
  }
})

async function echoServer(): Promise<{ url: string; connections: () => number }> {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  await new Promise((resolve) => server.once('listening', resolve))
  let count = 0
  server.on('connection', (ws) => {
    count += 1
    ws.on('message', (data, isBinary) => ws.send(data, { binary: isBinary }))
  })
  cleanups.push(() => server.close())
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return { url: `ws://127.0.0.1:${port}/v1/tunnels/hgt_x`, connections: () => count }
}

async function startProxy(resolve: (id: string) => Promise<{ endpoint: string }>) {
  const proxy = new InstaboxTunnelProxy(resolve)
  await proxy.start()
  cleanups.push(() => proxy.stop())
  return proxy
}

function open(url: string) {
  const ws = new WebSocket(url)
  cleanups.push(() => ws.terminate())
  const received: { data: string; binary: boolean }[] = []
  ws.on('message', (data, binary) => received.push({ data: data.toString(), binary }))
  const closed = new Promise<{ code: number; reason: string }>((resolve) =>
    ws.on('close', (code, reason) => resolve({ code, reason: reason.toString() }))
  )
  return { ws, received, closed }
}

const until = async (check: () => boolean): Promise<void> => {
  for (let i = 0; i < 100 && !check(); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  expect(check()).toBe(true)
}

describe('InstaboxTunnelProxy', () => {
  it('splices each socket to a freshly resolved tunnel, keeping frame types and early frames', async () => {
    const upstream = await echoServer()
    const resolved: string[] = []
    const proxy = await startProxy(async (machineId) => {
      resolved.push(machineId)
      await new Promise((resolve) => setTimeout(resolve, 30))
      return { endpoint: upstream.url }
    })
    const client = open(proxy.endpointFor('m_1'))
    await new Promise((resolve) => client.ws.once('open', resolve))
    client.ws.send('early-before-upstream')
    client.ws.send(Buffer.from('bin'), { binary: true })

    await until(() => client.received.length === 2)
    expect(client.received).toEqual([
      { data: 'early-before-upstream', binary: false },
      { data: 'bin', binary: true }
    ])
    const second = open(proxy.endpointFor('m_1'))
    await new Promise((resolve) => second.ws.once('open', resolve))
    await until(() => resolved.length === 2)
    expect(resolved).toEqual(['m_1', 'm_1'])
    await until(() => upstream.connections() === 2)
  })

  it('rejects endpoints without the process secret', async () => {
    const proxy = await startProxy(async () => ({ endpoint: 'ws://unused' }))
    const forged = proxy.endpointFor('m_1').replace(/instabox\/[0-9a-f]+\//, 'instabox/deadbeef/')
    expect((await open(forged).closed).code).toBe(1008)
  })

  it('asks the client to retry later when no tunnel can be had', async () => {
    const proxy = await startProxy(async () => {
      throw new Error('machine_not_running')
    })
    expect(await open(proxy.endpointFor('m_1')).closed).toEqual({
      code: 1013,
      reason: 'machine_not_running'
    })
  })

  it('closes the client when the tunnel closes', async () => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
    await new Promise((resolve) => server.once('listening', resolve))
    cleanups.push(() => server.close())
    server.on('connection', (ws) => ws.close(4001, 'Unauthorized'))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    const proxy = await startProxy(async () => ({ endpoint: `ws://127.0.0.1:${port}/` }))
    expect(await open(proxy.endpointFor('m_1')).closed).toEqual({
      code: 4001,
      reason: 'Unauthorized'
    })
  })
})
