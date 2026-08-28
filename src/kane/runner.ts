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
    step?: string
    status?: string
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
      const objective = `Go to ${portalUrl}. ${goal}

IMPORTANT: The previous workflow failed with this error:
${previousFailure}

Your task is to explore the CURRENT UI and find the correct path to accomplish the goal. Do not look for the old UI elements mentioned in the error. Discover what is actually present in the interface now.`

      const result = await this.executeKaneRun(
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
        '--variables',
        JSON.stringify({ portal_url: { value: portalUrl } })
      ]

      const proc = spawn('kane-cli', args, {
        shell: false,
        env: { ...process.env }
      })

      this.currentRun = proc
      let ndJsonBuffer = ''
      let lastRunEnd: KaneNDJSONLine | null = null
      const steps: Array<{ step?: string; status?: string; remark?: string }> = []

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
            
            // Collect step information from progress lines
            if (parsed.step && parsed.status) {
              steps.push({
                step: parsed.step,
                status: parsed.status,
                remark: parsed.remark
              })
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
          const result = this.parseRunEnd(lastRunEnd, steps)
          
          // Copy evidence
          if (lastRunEnd.run_dir) {
            await this.copyEvidence(lastRunEnd.run_dir, Date.now().toString())
          }
          
          resolve(result)
        } else {
          resolve({
            status: 'error',
            summary: 'Kane process completed but no run_end event received',
            duration: '0s',
            steps
          })
        }
      })

      proc.on('error', (err) => {
        reject(new Error(`Failed to spawn Kane: ${err.message}`))
      })
    })
  }

  private async executeKaneRun(
    objective: string,
    name: string,
    onProgress?: (line: KaneNDJSONLine) => void
  ): Promise<KaneResult> {
    return new Promise((resolve, reject) => {
      const args = [
        'run',
        objective,
        '--agent',
        '--headless',
        '--timeout',
        '180',
        '--name',
        name
      ]

      const proc = spawn('kane-cli', args, {
        shell: false,
        env: { ...process.env }
      })

      this.currentRun = proc
      let ndJsonBuffer = ''
      let lastRunEnd: KaneNDJSONLine | null = null
      const steps: Array<{ step?: string; status?: string; remark?: string }> = []

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
            
            // Collect step information from progress lines
            if (parsed.step && parsed.status) {
              steps.push({
                step: parsed.step,
                status: parsed.status,
                remark: parsed.remark
              })
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
          const result = this.parseRunEnd(lastRunEnd, steps)
          
          // Copy evidence
          if (lastRunEnd.run_dir) {
            await this.copyEvidence(lastRunEnd.run_dir, `repair-${name}`)
          }
          
          resolve(result)
        } else {
          resolve({
            status: 'error',
            summary: 'Kane process completed but no run_end event received',
            duration: '0s',
            steps
          })
        }
      })

      proc.on('error', (err) => {
        reject(new Error(`Failed to spawn Kane: ${err.message}`))
      })
    })
  }

  private parseRunEnd(runEnd: KaneNDJSONLine, steps: Array<{ step?: string; status?: string; remark?: string }>): KaneResult {
    return {
      status: runEnd.status === 'passed' ? 'passed' : 'failed',
      summary: runEnd.summary || 'No summary available',
      reason: runEnd.reason,
      duration: this.formatDuration(runEnd.duration),
      sessionDir: runEnd.session_dir,
      runDir: runEnd.run_dir,
      steps
    }
  }

  private formatDuration(duration: number | undefined): string {
    if (!duration) return '0s'
    const seconds = Math.floor(duration)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  private async copyEvidence(runDir: string, attemptId: string): Promise<void> {
    try {
      const evidenceDir = path.join(__dirname, '../../data/evidence', attemptId)
      await fs.mkdir(evidenceDir, { recursive: true })

      // Copy actions.ndjson from run-test/
      const actionsPath = path.join(runDir, 'run-test', 'actions.ndjson')
      try {
        await fs.copyFile(actionsPath, path.join(evidenceDir, 'actions.ndjson'))
      } catch {}

      // Copy Result.md from output-* directory
      try {
        const dirContents = await fs.readdir(runDir)
        for (const item of dirContents) {
          if (item.startsWith('output-')) {
            const resultPath = path.join(runDir, item, 'Result.md')
            try {
              await fs.copyFile(resultPath, path.join(evidenceDir, 'Result.md'))
              break
            } catch {}
          }
        }
      } catch {}

      // Copy screenshots if they exist
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

  async extractTestMdFromRun(runName: string, runDir: string): Promise<string | null> {
    // Try ~/.testmuai/tests/<name>_test.md first
    const homeDir = process.env.HOME || process.env.USERPROFILE
    if (homeDir) {
      try {
        const testMdPath = path.join(homeDir, '.testmuai', 'tests', `${runName}_test.md`)
        const content = await fs.readFile(testMdPath, 'utf-8')
        return content
      } catch {}
    }

    // Try cwd .testmuai/tests/
    try {
      const testMdPath = path.join(process.cwd(), '.testmuai', 'tests', `${runName}_test.md`)
      const content = await fs.readFile(testMdPath, 'utf-8')
      return content
    } catch {}

    // Try run directory as fallback
    try {
      const testMdPath = path.join(runDir, '_test.md')
      const content = await fs.readFile(testMdPath, 'utf-8')
      return content
    } catch {}

    return null
  }

  synthesizeWorkflowFromSteps(steps: Array<{ step?: string; status?: string; remark?: string }>, portalUrl: string): string | null {
    if (!steps || steps.length === 0) {
      return null
    }

    const successfulSteps = steps.filter(s => s.status === 'success' || s.status === 'passed')
    if (successfulSteps.length === 0) {
      return null
    }

    let workflow = `# Download Invoice\n\nNavigate to ${portalUrl}\n\n`
    
    for (const step of successfulSteps) {
      if (step.step && step.remark) {
        // Use the exact labels from Kane's remarks
        workflow += `${step.step}\n\n`
      }
    }

    workflow += `Assert a PDF download or success toast\n`

    return workflow
  }
}
