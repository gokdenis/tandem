import { spawn } from 'node:child_process'

const DEFAULT_URL = 'http://127.0.0.1:4173/'

/**
 * Use a caller-supplied deployment when URL is set. Otherwise start a private
 * Vite server and tear it down when the harness finishes.
 */
export async function startTargetServer() {
  if (process.env.URL) {
    return { url: process.env.URL, close: async () => {} }
  }

  const child = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4173', '--strictPort'],
    { cwd: process.cwd(), stdio: 'ignore' },
  )

  const killOnExit = () => {
    if (child.exitCode === null) child.kill('SIGTERM')
  }
  process.once('exit', killOnExit)

  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) {
      process.removeListener('exit', killOnExit)
      throw new Error(`The local Vite server stopped before it was ready (exit ${child.exitCode}).`)
    }
    try {
      const response = await fetch(DEFAULT_URL)
      if (response.ok) {
        return {
          url: DEFAULT_URL,
          close: async () => {
            process.removeListener('exit', killOnExit)
            if (child.exitCode !== null) return
            child.kill('SIGTERM')
            await Promise.race([
              new Promise((resolve) => child.once('exit', resolve)),
              new Promise((resolve) => setTimeout(resolve, 3000)),
            ])
            if (child.exitCode === null) child.kill('SIGKILL')
          },
        }
      }
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  killOnExit()
  process.removeListener('exit', killOnExit)
  throw new Error(`The local Vite server did not become ready at ${DEFAULT_URL}.`)
}
