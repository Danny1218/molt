import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs/promises'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export interface KaneResult {
  status: 'passed' | 'failed' | 'error'
  summary: string
  reason?: string
  duration: string
  sessionDir?: string
  runDir?: string
  steps?: Array<{
    action: string
    status: string
    remark?: string
  }>
}

export interface KaneNDJSONLine {
  type: string
  timestamp?: string
  [key: string]: any
}

export class KaneRunner {
  private static instance: KaneRunner
  private currentRun: ChildProcess | null = null
  private runLock = false

  static getInstance(): KaneRunner {
    if (!KaneRunner.instance) {
      KaneRunner.instance = new KaneRunner()
    }
    return KaneRunner.instance
  }

  async checkAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn('kane-cli', ['whoami'], { shell: true })
      let output = ''
      
      proc.stdout?.on('data', (data) => {
        output += data.toString()
      })
      
      proc.on('close', (code) => {
        resolve(code === 0 && output.length > 0)
      })
      
      proc.on('error', () => {
        resolve(false)
      })
    })
  }

  async runWorkflow(
    workflowPath: string,
    portalUrl: string,
    onProgress?: (line: KaneNDJSONLine) => void
  ): Promise<KaneResult> {
    if (this.runLock) {
      throw new Error('A Kane run is already in progress')
    }

    this.runLock = true

    try {
      const result = await this.executeKane(workflowPath, portalUrl, onProgress)
      return result
    } finally {
      this.runLock = false
      this.currentRun = null
    }
  }

  async runExploratoryRepair(
    goal: string,
    portalUrl: string,
    previousFailure: string,
    attemptNumber: number,
    onProgress?: (line: KaneNDJSONLine) => void
  ): Promise<KaneResult> {
    if (this.runLock) {
      throw new Error('A Kane run is already in progress')
    }

    this.runLock = true

    try {
      const objective = `${goal}

IMPORTANT: The previous workflow failed with this error:
${previousFailure}

Your task is to explore the CURRENT UI at ${portalUrl} and find the correct path to accomplish the goal. Do not look for the old UI elements mentioned in the error. Discover what is actually present in the interface now.`

      const result = await this.executeKaneRun(
        portalUrl,
        objective,
        `molt-repair-${attemptNumber}`,
        onProgress
      )
      
      return result
    } finally {
      this.runLock = false
      this.currentRun = null
    }
  }

  private async executeKane(
    workflowPath: string,
    portalUrl: string,
    onProgress?: (line: KaneNDJSONLine) => void
  ): Promise<KaneResult> {
    return new Promise((resolve, reject) => {
      const args = [
        'testmd',
        'run',
        workflowPath,
        '--agent',
        '--headless',
        '--timeout',
        '180',
        '--var',
        `portal_url=${portalUrl}`
      ]

      const proc = spawn('kane-cli', args, {
        shell: true,
        env: { ...process.env }
      })

      this.currentRun = proc
      let ndJsonBuffer = ''
      let lastRunEnd: KaneNDJSONLine | null = null

      proc.stdout?.on('data', (data) => {
        const chunk = data.toString()
        ndJsonBuffer += chunk

        const lines = ndJsonBuffer.split('\n')
        ndJsonBuffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          
          try {
            const parsed: KaneNDJSONLine = JSON.parse(line)
            
            if (parsed.type === 'run_end') {
              lastRunEnd = parsed
            }
            
            if (onProgress) {
              onProgress(parsed)
            }
          } catch (err) {
            console.error('Failed to parse Kane NDJSON line:', line)
          }
        }
      })

      proc.stderr?.on('data', (data) => {
        console.error('Kane stderr:', data.toString())
      })

      proc.on('close', async (code) => {
        if (lastRunEnd) {
          const result = this.parseRunEnd(lastRunEnd)
          
          // Copy evidence
          if (lastRunEnd.run_dir) {
            await this.copyEvidence(lastRunEnd.run_dir, Date.now().toString())
          }
          
          resolve(result)
        } else {
          resolve({
            status: 'error',
            summary: 'Kane process completed but no run_end event received',
            duration: '0s'
          })
        }
      })

      proc.on('error', (err) => {
        reject(new Error(`Failed to spawn Kane: ${err.message}`))
      })
    })
  }

  private async executeKaneRun(
    url: string,
    objective: string,
    name: string,
    onProgress?: (line: KaneNDJSONLine) => void
  ): Promise<KaneResult> {
    return new Promise((resolve, reject) => {
      const args = [
        'run',
        '--agent',
        '--headless',
        '--timeout',
        '180',
        '--name',
        name,
        '--url',
        url,
        '--objective',
        objective
      ]

      const proc = spawn('kane-cli', args, {
        shell: true,
        env: { ...process.env }
      })

      this.currentRun = proc
      let ndJsonBuffer = ''
      let lastRunEnd: KaneNDJSONLine | null = null

      proc.stdout?.on('data', (data) => {
        const chunk = data.toString()
        ndJsonBuffer += chunk

        const lines = ndJsonBuffer.split('\n')
        ndJsonBuffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          
          try {
            const parsed: KaneNDJSONLine = JSON.parse(line)
            
            if (parsed.type === 'run_end') {
              lastRunEnd = parsed
            }
            
            if (onProgress) {
              onProgress(parsed)
            }
          } catch (err) {
            console.error('Failed to parse Kane NDJSON line:', line)
          }
        }
      })

      proc.stderr?.on('data', (data) => {
        console.error('Kane stderr:', data.toString())
      })

      proc.on('close', async (code) => {
        if (lastRunEnd) {
          const result = this.parseRunEnd(lastRunEnd)
          
          // Copy evidence
          if (lastRunEnd.run_dir) {
            await this.copyEvidence(lastRunEnd.run_dir, `repair-${name}`)
          }
          
          resolve(result)
        } else {
          resolve({
            status: 'error',
            summary: 'Kane process completed but no run_end event received',
            duration: '0s'
          })
        }
      })

      proc.on('error', (err) => {
        reject(new Error(`Failed to spawn Kane: ${err.message}`))
      })
    })
  }

  private parseRunEnd(runEnd: KaneNDJSONLine): KaneResult {
    return {
      status: runEnd.status === 'passed' ? 'passed' : 'failed',
      summary: runEnd.summary || 'No summary available',
      reason: runEnd.reason,
      duration: this.formatDuration(runEnd.duration_ms),
      sessionDir: runEnd.session_dir,
      runDir: runEnd.run_dir
    }
  }

  private formatDuration(ms: number | undefined): string {
    if (!ms) return '0s'
    const seconds = Math.floor(ms / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  private async copyEvidence(runDir: string, attemptId: string): Promise<void> {
    try {
      const evidenceDir = path.join(__dirname, '../../data/evidence', attemptId)
      await fs.mkdir(evidenceDir, { recursive: true })

      // Copy NDJSON
      const ndJsonPath = path.join(runDir, 'run.ndjson')
      try {
        await fs.copyFile(ndJsonPath, path.join(evidenceDir, 'run.ndjson'))
      } catch {}

      // Copy Result.md
      const resultPath = path.join(runDir, 'Result.md')
      try {
        await fs.copyFile(resultPath, path.join(evidenceDir, 'Result.md'))
      } catch {}

      // Copy screenshots
      const screenshotsDir = path.join(runDir, 'screenshots')
      try {
        const screenshots = await fs.readdir(screenshotsDir)
        const targetScreenshotsDir = path.join(evidenceDir, 'screenshots')
        await fs.mkdir(targetScreenshotsDir, { recursive: true })
        
        for (const screenshot of screenshots) {
          await fs.copyFile(
            path.join(screenshotsDir, screenshot),
            path.join(targetScreenshotsDir, screenshot)
          )
        }
      } catch {}
    } catch (err) {
      console.error('Failed to copy evidence:', err)
    }
  }

  async extractTestMdFromRun(runDir: string): Promise<string | null> {
    try {
      // Kane saves generated workflows in the run directory
      const testMdPath = path.join(runDir, '_test.md')
      const content = await fs.readFile(testMdPath, 'utf-8')
      return content
    } catch {
      return null
    }
  }
}
