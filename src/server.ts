import express from 'express'
import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs/promises'
import { KaneRunner } from './kane/runner.js'
import { WorkflowStore } from './store/workflow.js'
import { RepairOrchestrator } from './kane/repair.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })
const wsClients = new Set<WebSocket>()

const PORT = process.env.PORT || 3000
const PORTAL_ONLY = process.argv.includes('--portal-only')

// Initialize Kane and workflow store
const kaneRunner = KaneRunner.getInstance()
const workflowStore = new WorkflowStore()
const repairOrchestrator = new RepairOrchestrator(wsClients)

await workflowStore.init()
await repairOrchestrator.initialize()

// Skin state (toggle between V1 and V2)
const SKIN_FILE = path.join(__dirname, '../data/portal-skin.json')
let currentSkin = 'v1'

async function loadSkin() {
  try {
    const data = await fs.readFile(SKIN_FILE, 'utf-8')
    currentSkin = JSON.parse(data).skin || 'v1'
  } catch {
    currentSkin = 'v1'
  }
}

async function saveSkin(skin: string) {
  await fs.mkdir(path.dirname(SKIN_FILE), { recursive: true })
  await fs.writeFile(SKIN_FILE, JSON.stringify({ skin }))
  currentSkin = skin
}

await loadSkin()

app.use(express.json())
app.use(express.static(path.join(__dirname, '../dist/client')))

// API: Get current portal skin
app.get('/api/portal/skin', (req, res) => {
  res.json({ skin: currentSkin })
})

// API: Set portal skin (deploy redesign)
app.post('/api/portal/skin', async (req, res) => {
  const { skin } = req.body
  if (skin !== 'v1' && skin !== 'v2') {
    return res.status(400).json({ error: 'Invalid skin' })
  }
  await saveSkin(skin)
  
  // Broadcast to all connected clients
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(JSON.stringify({ type: 'skin_changed', skin }))
    }
  })
  
  res.json({ skin })
})

// API: Download invoice PDF
app.get('/api/portal/invoice/:id', async (req, res) => {
  const { id } = req.params
  const pdfPath = path.join(__dirname, '../fixtures/invoice.pdf')
  
  try {
    const pdf = await fs.readFile(pdfPath)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${id}.pdf"`)
    res.send(pdf)
  } catch {
    res.status(404).json({ error: 'Invoice not found' })
  }
})

// API: Get workflow versions
app.get('/api/workflow/versions', async (req, res) => {
  try {
    const versionsDir = path.join(__dirname, '../data/versions')
    await fs.mkdir(versionsDir, { recursive: true })
    const files = await fs.readdir(versionsDir)
    const versions = files.filter(f => f.endsWith('_test.md')).sort()
    res.json({ versions })
  } catch {
    res.json({ versions: [] })
  }
})

// API: Get workflow content
app.get('/api/workflow/:version', async (req, res) => {
  try {
    const { version } = req.params
    const filePath = path.join(__dirname, '../data/versions', `${version}_test.md`)
    const content = await fs.readFile(filePath, 'utf-8')
    res.json({ content })
  } catch {
    res.status(404).json({ error: 'Version not found' })
  }
})

// API: Get current workflow
app.get('/api/workflow/current', async (req, res) => {
  try {
    const content = await workflowStore.getCurrentWorkflow()
    res.json({ content })
  } catch (err) {
    res.status(500).json({ error: 'Failed to load workflow' })
  }
})

// API: Check Kane status
app.get('/api/kane/status', async (req, res) => {
  try {
    const available = await kaneRunner.checkAvailable()
    res.json({ available })
  } catch {
    res.json({ available: false })
  }
})

// API: Run Kane workflow
app.post('/api/workflow/run', async (req, res) => {
  res.json({ status: 'started', runId: Date.now().toString() })
  
  // Run asynchronously
  const portalUrl = `http://localhost:${PORT}/portal`
  const workflowPath = path.join(__dirname, '../data/current_test.md')
  
  try {
    await repairOrchestrator.runWorkflowWithRepair(portalUrl, workflowPath)
  } catch (err) {
    console.error('Workflow run failed:', err)
    wsClients.forEach(client => {
      if (client.readyState === 1) {
        client.send(JSON.stringify({
          type: 'workflow_error',
          error: err instanceof Error ? err.message : 'Unknown error'
        }))
      }
    })
  }
})

// WebSocket for real-time updates
wss.on('connection', (ws) => {
  wsClients.add(ws)
  ws.send(JSON.stringify({ type: 'connected' }))
  
  ws.on('close', () => {
    wsClients.delete(ws)
  })
})

// Serve portal and console
app.get('/portal*', (req, res) => {
  res.sendFile(path.join(__dirname, 'portal/index.html'))
})

app.get('*', (req, res) => {
  if (PORTAL_ONLY) {
    return res.redirect('/portal')
  }
  res.sendFile(path.join(__dirname, '../dist/client/index.html'))
})

server.listen(PORT, () => {
  console.log(`🚀 MOLT server running on http://localhost:${PORT}`)
  console.log(`   Portal: http://localhost:${PORT}/portal`)
  if (!PORTAL_ONLY) {
    console.log(`   Console: http://localhost:${PORT}`)
  }
})
