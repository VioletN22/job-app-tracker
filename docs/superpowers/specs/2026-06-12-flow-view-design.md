# Application Flow View (Sankey) — Design

**Goal:** Give aplyd a visual flow showing how applications move through stages — where they get rejected immediately, advance to interview, get rejected later, or reach an offer — as a left-to-right Sankey diagram.

## Placement
- New **"Flow"** item in the sidebar (4th nav entry) → dedicated `FlowPage`.
- A compact **mini-Sankey preview card** on the Dashboard, clickable → navigates to the Flow page.

## Visualization (Option B — Outcome spine)
Rendered in aplyd's real light/cream theme (`--bg` white, `--ink` `#111110`, `--panel` `#f3f2ee`, accent `#f23a17`):
- The **active path is a horizontal spine**: `Started → Applied → … → Offer`, drawn along a baseline. The spine band thins at each stage as applications leave.
- **Rejected/withdrawn peel away as downward branches** at the exact stage they happened — so a branch under `Applied` is "rejected early" and one under `Interview` is "rejected late." Each branch ends in a small labelled stub (`Rejected 8`, `Withdrew 3`).
- **Colors:** spine/active flow soft coral `#e8927c`; offer green `#2f9e5f`; rejected `#c0563f`; withdrawn grey `#b0aea6`; node bars + stage labels ink `#111110`. Bands are translucent (opacity 0.3–0.5) for a calm, airy look.
- Labels sit **above** spine nodes and **below** terminal stubs so nothing overlaps. The last (offer) label is right-anchored so it never clips.
- **Summary strip:** conversion % (reached offer), rejected %, withdrew %, in-progress count.
- Custom SVG layout (`computeLayout`), no charting library — the spine/branch geometry is bespoke. Mini variant drops labels for the Dashboard preview card.

## Data computation
New main-process module `flow.ts`, exposed via IPC `flow:getData`:
1. Query all `stage_history` rows joined to applications, ordered by `application_id, entered_at`.
2. Reconstruct each application's ordered **path** of stages.
3. For each consecutive pair `(a → b)`, increment `link[a→b].count`. A node's count = number of applications that passed through it.
4. Classify nodes: `offer`, `rejected`, `withdrawn` → terminal kinds; everything else → `active`.
5. In-progress applications simply end at their current node (no outbound band).
6. **Cycle guard:** assign each stage a rank (`started`0 … `offer`5, `rejected`/`withdrawn` 99). Keep only links where `rank(b) > rank(a)` — drops accidental backward/self transitions that would break Sankey layout. Dropped links are logged.
7. Returns `{ nodes, links, summary }`.

**Empty state:** when no transitions exist yet (e.g. all applications at "started"), show the single node plus a hint: *"Move applications through stages to see the flow take shape."*

## Tech
- **No charting library** — the spine/branch layout is computed by a bespoke `computeLayout()` that emits SVG paths (smooth ribbons), bars, and labels. Renderer-only, no native deps. (An earlier Sankey draft used `d3-sankey`; removed in favor of the custom spine.)
- New files:
  - `src/main/flow.ts` — aggregation (`getFlowData()`).
  - `src/renderer/components/FlowChart.tsx` — reusable spine chart (full + `mini` variant).
  - `src/renderer/pages/FlowPage.tsx` — full page with summary strip.
- Modified:
  - `src/main/index.ts` — register `flow:getData` handler.
  - `src/main/preload.ts` — expose `flow.getData`.
  - `src/shared/types.ts` — `FlowNode`, `FlowLink`, `FlowData` types.
  - `src/renderer/components/Navigation.tsx` — add `'flow'` nav item.
  - `src/renderer/App.tsx` — route `'flow'`; pass a navigate callback to Dashboard.
  - `src/renderer/pages/DashboardPage.tsx` — mini Sankey preview card.
- No database schema changes.

## Types
```ts
export type FlowNodeKind = 'active' | 'offer' | 'rejected' | 'withdrawn';
export interface FlowNode { id: string; label: string; count: number; kind: FlowNodeKind; }
export interface FlowLink { source: string; target: string; count: number; }
export interface FlowSummary { total: number; offers: number; rejected: number; withdrawn: number; inProgress: number; }
export interface FlowData { nodes: FlowNode[]; links: FlowLink[]; summary: FlowSummary; }
```
