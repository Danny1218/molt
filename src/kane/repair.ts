import { KaneRunner, KaneResult } from '../kane/runner.js'
import { WorkflowStore } from '../store/workflow.js'
import { WebSocket } from 'ws'

export interface RepairContext {
  portalUrl: string
  previousFailure: string
  maxAttempts: number
}

export class RepairOrchestrator {
  private kane: KaneRunner
  private store: WorkflowStore
  private wsClients: Set<WebSocket>

  constructor(wsClients: Set<WebSocket>) {
    this.kane = KaneRunner.getInstance()
    this.store = new WorkflowStore()
    this.wsClients = wsClients
  }

  async initialize(): Promise<void> {
    await this.store.init()
  }

  private broadcast(message: any): void {
    const json = JSON.stringify(message)
    this.wsClients.forEach(client => {
      if (client.readyState === 1) {
        client.send(json)
      }
    })
  }

  async runWorkflowWithRepair(
    portalUrl: string,
    currentWorkflowPath: string,
    portalSkin: 'v1' | 'v2'
  ): Promise<KaneResult> {
    this.broadcast({ type: 'workflow_started' })

    // First run
    const result = await this.kane.runWorkflow(
      currentWorkflowPath,
      portalUrl,
      (line) => {
        this.broadcast({ type: 'kane_progress', data: line })
      }
    )

    if (result.status === 'passed') {
      this.broadcast({
        type: 'workflow_completed',
        result,
        evidence: this.formatEvidence(result)
      })
      return result
    }

    // Failure detected - check if it's UI drift
    if (this.isUIdrift(result, portalSkin)) {
      this.broadcast({
        type: 'workflow_failed',
        result,
        evidence: this.formatEvidence(result)
      })

      // Attempt repair
      const repairResult = await this.attemptRepair({
        portalUrl,
        previousFailure: result.reason || result.summary,
        maxAttempts: 2
      })

      return repairResult
    }

    // Non-drift failure
    this.broadcast({
      type: 'workflow_failed',
      result,
      evidence: this.formatEvidence(result)
    })

    return result
  }

  private isUIdrift(result: KaneResult, portalSkin: 'v1' | 'v2'): boolean {
    // Any failed testmd run on v2 skin is UI drift
    if (portalSkin === 'v2' && result.status === 'failed') {
      return true
    }

    // Additional keyword-based detection as extra hint
    const driftKeywords = [
      'not found',
      'could not find',
      'element not visible',
      'cannot locate',
      'does not exist',
      'no element',
      'selector failed'
    ]

    const text = `${result.summary} ${result.reason || ''}`.toLowerCase()
    return driftKeywords.some(keyword => text.includes(keyword))
  }

  private async attemptRepair(context: RepairContext): Promise<KaneResult> {
    const goal = 'Download the newest invoice PDF from this business portal'

    for (let attempt = 1; attempt <= context.maxAttempts; attempt++) {
      this.broadcast({ type: 'repair_started', attempt })

      // Run exploratory Kane
      const exploreResult = await this.kane.runExploratoryRepair(
        goal,
        context.portalUrl,
        context.previousFailure,
        attempt,
        (line) => {
          this.broadcast({ type: 'kane_progress', data: line })
        }
      )

      if (exploreResult.status !== 'passed') {
        if (attempt === context.maxAttempts) {
          this.broadcast({
            type: 'repair_failed',
            reason: 'Max repair attempts exceeded',
            attempts: attempt
          })
          return exploreResult
        }
        continue
      }

      // Extract generated workflow
      let newWorkflow: string | null = null
      const runName = `molt-repair-${attempt}`
      
      if (exploreResult.runDir) {
        newWorkflow = await this.kane.extractTestMdFromRun(runName, exploreResult.runDir)
      }

      // If Kane didn't generate a workflow, synthesize from step remarks
      if (!newWorkflow && exploreResult.steps && exploreResult.steps.length > 0) {
        newWorkflow = this.kane.synthesizeWorkflowFromSteps(exploreResult.steps, context.portalUrl)
      }

      // If we still don't have a workflow, fail the repair
      if (!newWorkflow) {
        if (attempt === context.maxAttempts) {
          this.broadcast({
            type: 'repair_failed',
            reason: 'Kane did not generate a workflow and synthesis failed',
            attempts: attempt
          })
          return {
            status: 'error',
            summary: 'Could not extract or synthesize workflow from Kane run',
            duration: '0s'
          }
        }
        continue
      }

      // Enhance with assertions
      newWorkflow = await this.store.enhanceWorkflowWithAssertions(newWorkflow, 'v2')

      // Save as v2
      await this.store.saveWorkflow('v2', newWorkflow)
      await this.store.setCurrentVersion('v2')

      this.broadcast({ type: 'workflow_patched', version: 'v2' })

      // Rerun with patched workflow
      const verifyResult = await this.kane.runWorkflow(
        this.store.getCurrentWorkflowPath(),
        context.portalUrl,
        (line) => {
          this.broadcast({ type: 'kane_progress', data: line })
        }
      )

      if (verifyResult.status === 'passed') {
        this.broadcast({
          type: 'repair_completed',
          result: verifyResult,
          attempts: attempt
        })
        return verifyResult
      }

      if (attempt === context.maxAttempts) {
        this.broadcast({
          type: 'repair_failed',
          reason: 'Patched workflow still fails',
          attempts: attempt
        })
        return verifyResult
      }
    }

    return {
      status: 'error',
      summary: 'Repair failed',
      duration: '0s'
    }
  }

  private formatEvidence(result: KaneResult): Array<{
    timestamp: string
    status: string
    summary: string
    files?: string[]
  }> {
    return [{
      timestamp: new Date().toISOString(),
      status: result.status,
      summary: result.summary,
      files: result.runDir ? [
        `${result.runDir}/run-test/actions.ndjson`,
        `${result.runDir}/output-*/Result.md`
      ] : undefined
    }]
  }
}
