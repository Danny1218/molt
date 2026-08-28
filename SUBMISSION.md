# MOLT - Kane CLI Online Hackathon Submission

## Project Description

MOLT is a browser automation system that repairs itself when websites change. It stores goal-oriented Kane workflows and, when UI drift causes failures, automatically generates and validates new workflows while maintaining a complete evidence trail.

Unlike generic test frameworks that simply report failures, MOLT uses Kane's closed-loop capabilities to:

1. **Detect** UI drift through exact-label assertions that force real failures
2. **Diagnose** by spawning exploratory Kane runs with goal-oriented instructions
3. **Repair** by generating new workflows that match the current UI
4. **Validate** by rerunning the patched workflow to ensure it passes
5. **Promote** the working version while preserving all previous versions

This makes MOLT a **workflow versioning system** specifically designed for Kane, not just another testing wrapper.

## Technical Explanation

### Architecture

MOLT consists of four main components:

1. **Demo Portal**: A self-contained business portal with two materially different UI skins (V1 and V2) representing a realistic redesign. Both accomplish the same goal (download invoice PDF) but with different navigation paths and labels.

2. **Kane Runner**: Spawns Kane CLI as a child process, parses NDJSON output in real-time, and copies evidence (NDJSON, Result.md, screenshots) to persistent storage.

3. **Repair Orchestrator**: Implements the closed-loop repair logic:
   - Runs workflow → detects UI drift failure
   - Spawns exploratory Kane with goal + previous failure context
   - Extracts generated workflow or falls back to V2 template
   - Enhances with exact-label assertions
   - Reruns for validation
   - Bounded to 2 attempts to prevent infinite loops

4. **Console UI**: Real-time visualization showing execution timeline, workflow diffs, evidence trail, and portal skin status via WebSocket.

### Why Kane is Indispensable

**Exact-label assertions** are critical. By using "Click button labeled exactly 'Download'" instead of fuzzy selectors, we force Kane 0.8.5's adaptive healing to fail when labels change. This creates real UI drift scenarios that trigger repair.

**Goal-oriented exploration** means Kane explores the *current* UI to accomplish the goal, not searching for old labels. The repair orchestrator passes the objective ("Download the newest invoice PDF") plus the previous failure, instructing Kane to discover what's actually present.

**Evidence capture** from real browser runs provides the raw NDJSON, step remarks, duration, and screenshots that prove the workflow actually executed.

**Workflow generation** by Kane creates valid testmd files that we enhance with skin-specific assertions, completing the closed loop.

Without Kane, we'd need to:
- Write custom browser automation from scratch
- Manually map UI changes to workflow updates
- Maintain fragile selectors that break silently
- Lose the goal-oriented exploration capability

Kane makes MOLT possible by handling both execution and repair generation.

## Demo Script (3 minutes)

### 0:00 - Introduction (8s)
> "MOLT: browser automations that repair themselves when websites change."

Show MOLT console with timeline at WORKFLOW READY.

### 0:08 - Working Automation (17s)
> "This is V1 of our portal. Watch Kane execute the workflow."

Click Run. Timeline progresses: WORKFLOW READY → KANE RUNNING → PASS.

Show evidence: "8 seconds, downloaded invoice successfully."

### 0:25 - Redesign (10s)
> "Now we deploy the redesign."

Click DEPLOY REDESIGN. Portal switches to V2 (dark/green theme, different nav).

### 0:35 - Kane Fail (20s)
> "Same workflow, new UI. Watch it fail."

Click Run. Timeline: KANE RUNNING → FAIL — UI DRIFT DETECTED.

Show evidence: "Could not find 'Billing' or 'Invoices'. UI structure changed."

### 0:55 - Diagnose/Repair (35s)
> "MOLT detects the drift and launches repair. Kane explores the current UI to find the new path."

Timeline: AGENT DIAGNOSING → WORKFLOW PATCHED.

> "Kane discovered Finance → Documents → Statements → Export PDF. Generated new workflow."

### 1:30 - Rerun (20s)
> "Now rerun with the patched workflow."

Timeline: KANE RE-RUNNING → PASS → NEW WORKFLOW PROMOTED.

Show evidence: "5 seconds, statement exported successfully."

### 1:50 - Diff + Evidence (10s)
> "Here's the diff. V1 used Billing/Invoices/Download. V2 uses Finance/Documents/Statements/Export PDF."

Show side-by-side workflow comparison.

### 2:00 - Why Kane is Indispensable (30s)
> "This only works because Kane:
> 1. Forces real failures with exact-label assertions
> 2. Explores goal-first, not selector-first
> 3. Generates valid workflows from real browser runs
> 4. Captures complete evidence trails
>
> MOLT isn't just a testing tool. It's workflow versioning powered by Kane's closed-loop automation."

Show version list: v1, v2 with timestamps.

### 2:30 - Close (under 3:00)
> "Browser automations that repair themselves. That's MOLT."

## Screen Recording Shot List

| Time | Shot | Notes |
|------|------|-------|
| 0:00 | Console - timeline ready | Clean state, V1 badge visible |
| 0:08 | Console - click Run | Button press, timeline animates |
| 0:15 | Timeline - KANE RUNNING | Active animation on step |
| 0:20 | Timeline - PASS | Green checkmark, evidence appears |
| 0:25 | Portal V1 | Show before redesign |
| 0:30 | Console - DEPLOY REDESIGN button | Click, badge changes V1→V2 |
| 0:32 | Portal V2 | Show after redesign (dark theme) |
| 0:35 | Console - Run again | Second run starts |
| 0:40 | Timeline - FAIL | Red X, drift detected message |
| 0:45 | Evidence - failure reason | Show "Could not find Billing" |
| 0:55 | Timeline - AGENT DIAGNOSING | Active repair animation |
| 1:05 | Timeline - WORKFLOW PATCHED | Patch complete |
| 1:15 | Workflow Diff | Side-by-side V1 vs V2 |
| 1:30 | Timeline - KANE RE-RUNNING | Revalidation |
| 1:40 | Timeline - PASS | Second green checkmark |
| 1:45 | Timeline - NEW WORKFLOW PROMOTED | Final step complete |
| 1:50 | Workflow Diff | Full comparison with highlights |
| 2:00 | Evidence Trail | Both runs, NDJSON links |
| 2:10 | Workflow Info panel | Version, skin, goal, timestamps |
| 2:20 | Portal V2 nav path | Show Finance → Documents → Statements |
| 2:30 | Version list | v1, v2 with metadata |

## Production Quality Checklist

- [ ] Clean, professional UI design (Linear/Vercel aesthetic)
- [ ] Real-time WebSocket updates (no fake loading)
- [ ] Actual Kane NDJSON parsing
- [ ] Evidence copied from real run directories
- [ ] Exact-label assertions in workflows
- [ ] Two visually distinct portal themes
- [ ] Bounded repair (max 2 attempts)
- [ ] Unit tests passing
- [ ] README with architecture diagram
- [ ] No secrets in git
- [ ] Single-command setup

## Links

- GitHub: [Repository URL]
- Demo Video: [To be recorded]
- Live Demo: `npm start` → http://localhost:3000

## Team

Solo project for Kane CLI Online Hackathon.

## Acknowledgments

Built with Kane CLI by TestMu. Inspired by the challenge of maintaining browser automations in the face of constant UI changes.
