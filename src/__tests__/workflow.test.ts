import { describe, it, expect, beforeEach } from 'vitest'
import { WorkflowStore } from '../store/workflow.js'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('WorkflowStore', () => {
  let store: WorkflowStore
  const testDataDir = path.join(__dirname, '../../data-test')

  beforeEach(async () => {
    // Use test directory
    store = new WorkflowStore()
    store['versionsDir'] = path.join(testDataDir, 'versions')
    store['currentWorkflowPath'] = path.join(testDataDir, 'current_test.md')
    
    // Clean up
    try {
      await fs.rm(testDataDir, { recursive: true, force: true })
    } catch {}
    
    await store.init()
  })

  it('should initialize with default v1 workflow', async () => {
    const current = await store.getCurrentWorkflow()
    expect(current).toContain('Billing')
    expect(current).toContain('Invoices')
    expect(current).toContain('Download')
  })

  it('should save and retrieve workflow versions', async () => {
    const v2Workflow = store.getDefaultV2Workflow()
    await store.saveWorkflow('v2', v2Workflow)
    
    const retrieved = await store.getWorkflowVersion('v2')
    expect(retrieved).toBe(v2Workflow)
  })

  it('should list available versions', async () => {
    await store.saveWorkflow('v1', 'workflow v1')
    await store.saveWorkflow('v2', 'workflow v2')
    
    const versions = await store.listVersions()
    expect(versions).toContain('v1')
    expect(versions).toContain('v2')
  })

  it('should enhance workflow with assertions for v2', async () => {
    const baseWorkflow = `# Test
Navigate to {{portal_url}}
Click Finance
Click Documents
Click Statements`
    
    const enhanced = await store.enhanceWorkflowWithAssertions(baseWorkflow, 'v2')
    expect(enhanced).toContain('Assert heading is "Statements"')
  })
})
