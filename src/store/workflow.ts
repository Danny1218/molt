import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export interface WorkflowVersion {
  version: string
  content: string
  createdAt: string
  repairAttempts?: number
  previousVersion?: string
}

export class WorkflowStore {
  private versionsDir: string
  private currentWorkflowPath: string

  constructor() {
    this.versionsDir = path.join(__dirname, '../../data/versions')
    this.currentWorkflowPath = path.join(__dirname, '../../data/current_test.md')
  }

  async init(): Promise<void> {
    await fs.mkdir(this.versionsDir, { recursive: true })
    
    // Initialize with default V1 workflow if needed
    try {
      await fs.access(this.currentWorkflowPath)
    } catch {
      await this.saveWorkflow('v1', this.getDefaultV1Workflow())
      await this.setCurrentVersion('v1')
    }
  }

  async getCurrentWorkflow(): Promise<string> {
    try {
      return await fs.readFile(this.currentWorkflowPath, 'utf-8')
    } catch {
      const defaultWorkflow = this.getDefaultV1Workflow()
      await fs.writeFile(this.currentWorkflowPath, defaultWorkflow)
      return defaultWorkflow
    }
  }

  getCurrentWorkflowPath(): string {
    return this.currentWorkflowPath
  }

  async saveWorkflow(version: string, content: string): Promise<void> {
    const versionPath = path.join(this.versionsDir, `${version}_test.md`)
    await fs.writeFile(versionPath, content)
  }

  async setCurrentVersion(version: string): Promise<void> {
    const versionPath = path.join(this.versionsDir, `${version}_test.md`)
    const content = await fs.readFile(versionPath, 'utf-8')
    await fs.writeFile(this.currentWorkflowPath, content)
  }

  async getWorkflowVersion(version: string): Promise<string | null> {
    try {
      const versionPath = path.join(this.versionsDir, `${version}_test.md`)
      return await fs.readFile(versionPath, 'utf-8')
    } catch {
      return null
    }
  }

  async listVersions(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.versionsDir)
      return files
        .filter(f => f.endsWith('_test.md'))
        .map(f => f.replace('_test.md', ''))
        .sort()
    } catch {
      return []
    }
  }

  async enhanceWorkflowWithAssertions(
    workflow: string,
    skin: 'v1' | 'v2'
  ): Promise<string> {
    // Add exact-label assertions based on the skin
    let enhanced = workflow

    if (skin === 'v1') {
      if (!enhanced.includes('Assert heading is "Invoices"')) {
        enhanced = enhanced.replace(
          /Click.*Invoices/i,
          `Click nav labeled exactly "Invoices"\n\nAssert heading is "Invoices"`
        )
      }
    } else if (skin === 'v2') {
      if (!enhanced.includes('Assert heading is "Statements"')) {
        enhanced = enhanced.replace(
          /Click.*Statements/i,
          `Click nav labeled exactly "Statements"\n\nAssert heading is "Statements"`
        )
      }
    }

    return enhanced
  }

  private getDefaultV1Workflow(): string {
    return `---
mode: testing
max_steps: 30
---

# Download newest invoice

## Open the portal
Open {{portal_url}}.

## Open Billing
Click the sidebar item whose visible text is exactly "Billing".

## Open Invoices
Click the control whose visible text is exactly "Invoices".
Verify the page heading is exactly "Invoices".

## Open the latest invoice
Click the row for the latest invoice.

## Download
Click the button labeled exactly "Download".
Verify a success toast is visible or a PDF download started.
`
  }
}
