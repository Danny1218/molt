import { describe, it, expect } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('Kane NDJSON Parser', () => {
  it('should parse successful Kane run', async () => {
    const fixture = path.join(__dirname, '../../fixtures/kane-run-end-pass.ndjson')
    const content = await fs.readFile(fixture, 'utf-8')
    const lines = content.trim().split('\n')
    
    let runEnd = null
    for (const line of lines) {
      const parsed = JSON.parse(line)
      if (parsed.type === 'run_end') {
        runEnd = parsed
      }
    }
    
    expect(runEnd).toBeTruthy()
    expect(runEnd?.status).toBe('passed')
    expect(runEnd?.summary).toContain('downloaded invoice')
    expect(runEnd?.duration).toBe(8)
  })

  it('should parse failed Kane run', async () => {
    const fixture = path.join(__dirname, '../../fixtures/kane-run-end-fail.ndjson')
    const content = await fs.readFile(fixture, 'utf-8')
    const lines = content.trim().split('\n')
    
    let runEnd = null
    for (const line of lines) {
      const parsed = JSON.parse(line)
      if (parsed.type === 'run_end') {
        runEnd = parsed
      }
    }
    
    expect(runEnd).toBeTruthy()
    expect(runEnd?.status).toBe('failed')
    expect(runEnd?.reason).toContain('Could not find')
  })
})

describe('Drift Classifier', () => {
  function isUIdrift(summary: string, reason?: string): boolean {
    const driftKeywords = [
      'not found',
      'could not find',
      'element not visible',
      'cannot locate',
      'does not exist',
      'no element',
      'selector failed'
    ]
    
    const text = `${summary} ${reason || ''}`.toLowerCase()
    return driftKeywords.some(keyword => text.includes(keyword))
  }

  it('should detect UI drift from failure message', () => {
    expect(isUIdrift('Failed', 'Could not find element Billing')).toBe(true)
    expect(isUIdrift('Element not found', 'Sidebar item does not exist')).toBe(true)
    expect(isUIdrift('Timeout waiting for element', 'Cannot locate Invoices')).toBe(true)
  })

  it('should not flag non-drift failures', () => {
    expect(isUIdrift('Network timeout', 'Connection refused')).toBe(false)
    expect(isUIdrift('Page crashed', 'Browser error')).toBe(false)
    expect(isUIdrift('Assertion failed', 'Expected value 5 but got 3')).toBe(false)
  })
})
