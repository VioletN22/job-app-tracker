import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, FileText, Brain, MessageSquareHeart, Sparkles, Link2, PenLine, Lock, Wand2, Check, ThumbsUp, ThumbsDown, Play, Square, Send, Inbox, AlertTriangle, RotateCcw, Search } from 'lucide-react';
import { AnswerBankEntry, LockerDocument, VoiceNote, VoiceNoteKind, PortfolioLink, CoverLetter, AutopilotJob, AutopilotNeed, DriveStatus } from '../../shared/types';

const api = () => window.electronAPI.autopilot;
const drive = () => window.electronAPI.drive;

const card: React.CSSProperties = {
  border: '1px solid var(--ink, rgba(0,0,0,.12))',
  borderRadius: 14,
  padding: 18,
  marginBottom: 18,
  background: 'var(--panel, rgba(0,0,0,.02))',
};
const input: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid var(--ink, rgba(0,0,0,.2))',
  background: 'transparent', color: 'var(--ink, inherit)', fontSize: 13, width: '100%',
};
const btn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8,
  border: '1px solid var(--ink, rgba(0,0,0,.2))', background: 'transparent', cursor: 'pointer',
  fontSize: 13, fontWeight: 600, color: 'var(--ink, inherit)',
};
const tagChip: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em',
  padding: '2px 7px', borderRadius: 6, border: '1px solid var(--ink, rgba(0,0,0,.25))', opacity: 0.7,
};

export const AutopilotPage: React.FC = () => {
  const [answers, setAnswers] = useState<AnswerBankEntry[]>([]);
  const [docs, setDocs] = useState<LockerDocument[]>([]);
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [links, setLinks] = useState<PortfolioLink[]>([]);
  const [letters, setLetters] = useState<CoverLetter[]>([]);

  const reload = async () => {
    setAnswers(await api().getAnswerBank());
    setDocs(await api().getDocuments());
    setNotes(await api().getVoiceNotes());
    setLinks(await api().getPortfolioLinks());
    setLetters(await api().getCoverLetters());
  };
  useEffect(() => { reload(); }, []);

  return <WorkspaceShell core={{ answers, docs, notes, links, letters, reload }} />;
};

// ═══════════════ Workspace cockpit (redesign) ═══════════════════════════════
type CoreData = { answers: AnswerBankEntry[]; docs: LockerDocument[]; notes: VoiceNote[]; links: PortfolioLink[]; letters: CoverLetter[]; reload: () => void };

const STATE_DOT: Record<string, string> = {
  filling: '#c08a25', needs_input: '#c08a25', ready: '#f23a17', approved: '#f23a17',
  submitting: '#f23a17', submitted: '#1f9d55', logged: '#1f9d55', queued: '#c7c3bb',
  skipped: '#c7c3bb', failed: '#c0392b',
};
const SITE_LABEL: Record<string, string> = {
  linkedin: 'LinkedIn', indeed: 'Indeed', seek: 'Seek', glassdoor: 'Glassdoor',
  ziprecruiter: 'ZipRecruiter', adzuna: 'Adzuna', jora: 'Jora', weworkremotely: 'We Work Remotely', other: 'Other',
};
const FolderGlyph: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} style={{ opacity: 0.7, flex: 'none' }}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
);

// Report a mount div's screen bounds to main so the native BrowserView tracks it.
function useViewBounds(ref: React.RefObject<HTMLDivElement>, slot: number, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    const report = () => {
      const r = el.getBoundingClientRect();
      window.electronAPI.view.setBounds(slot, { x: r.left, y: r.top, width: r.width, height: r.height });
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    window.addEventListener('resize', report);
    const t = window.setInterval(report, 700); // catch rail collapse / layout shifts
    return () => { ro.disconnect(); window.removeEventListener('resize', report); clearInterval(t); };
  }, [ref, slot, active]);
}

const WorkspaceShell: React.FC<{ core: CoreData }> = ({ core }) => {
  const [jobs, setJobs] = useState<AutopilotJob[]>([]);
  const [needs, setNeeds] = useState<AutopilotNeed[]>([]);
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [settings, setSettings] = useState<AutopilotSettings | null>(null);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('Idle');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [split, setSplit] = useState(false);

  const reloadDrive = async () => {
    const s = await drive().status();
    setJobs(s.jobs); setNeeds(s.needs); setRunning(s.running);
    setSearches(await window.electronAPI.search.getAll());
    setSettings(await window.electronAPI.settings.get());
  };
  useEffect(() => {
    reloadDrive();
    const off = drive().onProgress((st: DriveStatus) => {
      setRunning(st.running); setStatus(st.message);
      drive().getJobs().then(setJobs); drive().getNeeds().then(setNeeds);
    });
    const t = window.setInterval(reloadDrive, 4000);
    window.electronAPI.view.setVisible(true);
    window.electronAPI.view.getSlots().then((r) => setSplit(r.slots > 1));
    return () => { off(); clearInterval(t); window.electronAPI.view.setVisible(false); };
  }, []);

  const selected = jobs.find((j) => j.id === selectedId) || null;
  const setSplitMode = async (on: boolean) => { setSplit(on); await window.electronAPI.view.setSlots(on ? 2 : 1); };

  return (
    <div style={{ position: 'fixed', top: 58, left: 'var(--nav-w, 256px)', right: 0, bottom: 0, display: 'flex', background: 'var(--bg)', color: 'var(--ink)', transition: 'left .18s ease' }}>
      <SourcesRail jobs={jobs} needs={needs} searches={searches} selectedId={selectedId} onSelect={setSelectedId} reload={reloadDrive} />
      <WorkspacePane jobs={jobs} needs={needs} settings={settings} running={running} status={status} split={split} onSplit={setSplitMode} reload={reloadDrive} selected={selected} />
      <CoreRail core={core} settings={settings} reloadDrive={reloadDrive} />
    </div>
  );
};

// ── Sources rail (left): smart status groups + by-site folders ───────────────
const SourcesRail: React.FC<{ jobs: AutopilotJob[]; needs: AutopilotNeed[]; searches: SavedSearch[]; selectedId: string | null; onSelect: (id: string) => void; reload: () => void }> = ({ jobs, needs, searches, selectedId, onSelect, reload }) => {
  const [group, setGroup] = useState<'site' | 'status'>('site');
  const [open, setOpen] = useState<Record<string, boolean>>({ linkedin: true });
  const [showAdd, setShowAdd] = useState(false);
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  const Row: React.FC<{ j: AutopilotJob }> = ({ j }) => (
    <div onClick={() => onSelect(j.id)} title={j.url}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 7, cursor: 'pointer', fontSize: 12,
        background: selectedId === j.id ? 'rgba(242,58,23,.09)' : 'transparent',
        boxShadow: selectedId === j.id ? 'inset 0 0 0 1px rgba(242,58,23,.32)' : 'none' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATE_DOT[j.state] || '#ccc', flex: 'none' }} />
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(j.company || 'Unknown') + ' — ' + (j.title || 'Role')}</span>
    </div>
  );

  const bySite: Record<string, AutopilotJob[]> = {};
  jobs.forEach((j) => { const k = j.source || 'other'; (bySite[k] = bySite[k] || []).push(j); });
  const statusGroups: [string, AutopilotJob[]][] = [
    ['Filling', jobs.filter((j) => j.state === 'filling')],
    ['Queued', jobs.filter((j) => j.state === 'queued')],
    ['Submitted', jobs.filter((j) => ['submitted', 'logged'].includes(j.state))],
    ['Failed', jobs.filter((j) => j.state === 'failed')],
  ];
  const needsCount = jobs.filter((j) => j.state === 'needs_input').length + needs.length;
  const readyCount = jobs.filter((j) => j.state === 'ready').length;

  const Smart: React.FC<{ label: string; color: string; count: number; jb: AutopilotJob[] }> = ({ label, color, count, jb }) => (
    <div style={{ marginBottom: 2 }}>
      <div onClick={() => toggle('smart:' + label)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />{label}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted, #888)', background: 'rgba(0,0,0,.06)', borderRadius: 20, padding: '1px 7px', fontWeight: 700 }}>{count}</span>
      </div>
      {open['smart:' + label] && <div style={{ marginLeft: 14 }}>{jb.map((j) => <Row key={j.id} j={j} />)}</div>}
    </div>
  );

  return (
    <div style={{ width: 238, flex: 'none', borderRight: '1px solid var(--line, rgba(0,0,0,.11))', display: 'flex', flexDirection: 'column', background: '#faf9f6', minHeight: 0 }}>
      <div style={{ padding: '12px 13px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--muted, #888)' }}>Applications</h2>
          <span style={{ display: 'inline-flex', border: '1px solid var(--line, rgba(0,0,0,.15))', borderRadius: 7, overflow: 'hidden', fontSize: 10, fontWeight: 700 }}>
            {(['site', 'status'] as const).map((g) => (
              <b key={g} onClick={() => setGroup(g)} style={{ padding: '3px 8px', cursor: 'pointer', color: group === g ? '#fff' : 'var(--muted,#888)', background: group === g ? 'var(--ink,#111)' : 'transparent', textTransform: 'capitalize' }}>{g}</b>
            ))}
          </span>
        </div>
      </div>
      <div style={{ padding: '0 9px 4px' }}>
        <Smart label="Needs you" color="#c08a25" count={needsCount} jb={jobs.filter((j) => j.state === 'needs_input')} />
        <Smart label="Ready to submit" color="#f23a17" count={readyCount} jb={jobs.filter((j) => j.state === 'ready')} />
      </div>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--muted,#888)', padding: '10px 13px 4px' }}>By {group}</div>
      <div style={{ overflow: 'auto', padding: '0 9px 8px', flex: 1 }}>
        {group === 'site' ? Object.keys(bySite).sort().map((site) => (
          <div key={site} style={{ marginBottom: 1 }}>
            <div onClick={() => toggle(site)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: open[site] ? 700 : 400 }}>
              <span style={{ width: 9, color: 'var(--muted,#888)', fontSize: 9 }}>{open[site] ? '▾' : '▸'}</span>
              <FolderGlyph />{SITE_LABEL[site] || site}
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted,#888)', background: 'rgba(0,0,0,.06)', borderRadius: 20, padding: '1px 7px' }}>{bySite[site].length}</span>
            </div>
            {open[site] && <div style={{ margin: '1px 0 6px 12px', borderLeft: '1px solid var(--line,rgba(0,0,0,.1))', paddingLeft: 6 }}>{bySite[site].map((j) => <Row key={j.id} j={j} />)}</div>}
          </div>
        )) : statusGroups.map(([label, jb]) => (
          <div key={label} style={{ marginBottom: 1 }}>
            <div onClick={() => toggle('st:' + label)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: open['st:' + label] ? 700 : 400 }}>
              <span style={{ width: 9, color: 'var(--muted,#888)', fontSize: 9 }}>{open['st:' + label] ? '▾' : '▸'}</span>
              {label}
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted,#888)', background: 'rgba(0,0,0,.06)', borderRadius: 20, padding: '1px 7px' }}>{jb.length}</span>
            </div>
            {open['st:' + label] && <div style={{ margin: '1px 0 6px 12px', borderLeft: '1px solid var(--line,rgba(0,0,0,.1))', paddingLeft: 6 }}>{jb.map((j) => <Row key={j.id} j={j} />)}</div>}
          </div>
        ))}
      </div>
      <div style={{ borderTop: '1px solid var(--line,rgba(0,0,0,.1))', padding: 9 }}>
        <button style={{ ...btn, width: '100%', justifyContent: 'center', fontSize: 12 }} onClick={() => setShowAdd((v) => !v)}><Search size={13} /> Saved searches</button>
        {showAdd && <div style={{ marginTop: 8 }}><SavedSearchManager searches={searches} reload={reload} onHarvest={() => drive().harvest()} running={false} /></div>}
      </div>
    </div>
  );
};

// ── Workspace (center): live embedded browser + action bar ───────────────────
const WorkspacePane: React.FC<{ jobs: AutopilotJob[]; needs: AutopilotNeed[]; settings: AutopilotSettings | null; running: boolean; status: string; split: boolean; onSplit: (on: boolean) => void; reload: () => void; selected: AutopilotJob | null }> = ({ jobs, needs, running, status, split, onSplit, reload, selected }) => {
  const slot0 = useRef<HTMLDivElement>(null);
  const slot1 = useRef<HTMLDivElement>(null);
  useViewBounds(slot0, 0, true);
  useViewBounds(slot1, 1, split);

  const [busy, setBusy] = useState(false);
  const [ans, setAns] = useState('');
  const firstNeed = needs[0] || null;
  const nextReady = jobs.find((j) => j.state === 'ready') || null;
  const readyCount = jobs.filter((j) => j.state === 'ready').length;
  const filling = jobs.find((j) => j.state === 'filling') || null;
  const head = selected || filling || nextReady;

  const run = async () => { await drive().runFull(); };
  const stop = async () => { await drive().stop(); };
  const harvest = async () => { await drive().harvest(); };
  const approve = async (id: string) => { setBusy(true); await drive().approve(id); await reload(); setBusy(false); };
  const approveAll = async () => { setBusy(true); await drive().approveAll(); await reload(); setBusy(false); };
  const answer = async (v: string) => { if (!firstNeed || !v.trim()) return; setBusy(true); await drive().answerNeed(firstNeed.id, v.trim()); setAns(''); await reload(); setBusy(false); };

  const Mount: React.FC<{ r: React.RefObject<HTMLDivElement>; tint?: string }> = ({ r, tint }) => (
    <div ref={r} style={{ flex: 1, margin: 12, border: '1px solid var(--line,rgba(0,0,0,.12))', borderTop: tint ? `3px solid ${tint}` : '1px solid var(--line,rgba(0,0,0,.12))', borderRadius: 10, background: '#fff', minWidth: 0, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted,#aaa)', fontSize: 12, textAlign: 'center', padding: 20 }}>
        The live application renders here.<br />Run autopilot, or log in when prompted.
      </div>
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#faf9f6' }}>
      {/* header */}
      <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--line,rgba(0,0,0,.11))', background: 'var(--bg,#fff)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--muted,#888)', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {head ? <>{SITE_LABEL[head.source || 'other'] || head.source} <span style={{ opacity: .5 }}>›</span> {head.title || 'Role'} <span style={{ opacity: .5 }}>›</span> <b style={{ color: 'var(--ink,#111)' }}>{head.company || 'Unknown'}</b></> : 'Autopilot workspace'}
          </div>
          {head?.fitScore != null && <span style={{ ...tagChip, borderColor: 'rgba(31,157,85,.5)', color: '#1f9d55' }}>fit {head.fitScore}</span>}
          <span style={{ marginLeft: 'auto', display: 'inline-flex', border: '1px solid var(--line,rgba(0,0,0,.15))', borderRadius: 7, overflow: 'hidden' }}>
            <b onClick={() => onSplit(false)} style={{ padding: '4px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: !split ? '#fff' : 'var(--muted,#888)', background: !split ? 'var(--ink,#111)' : 'transparent' }}>Single</b>
            <b onClick={() => onSplit(true)} style={{ padding: '4px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: split ? '#fff' : 'var(--muted,#888)', background: split ? 'var(--ink,#111)' : 'transparent' }}>Split</b>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
          {running
            ? <button style={{ ...btn, borderColor: 'var(--accent,#f23a17)', color: 'var(--accent,#f23a17)' }} onClick={stop}><Square size={12} /> Stop</button>
            : <button style={{ ...btn, background: 'var(--accent,#f23a17)', color: '#fff', borderColor: 'var(--accent,#f23a17)' }} onClick={run}><Play size={12} /> Run</button>}
          <button style={btn} onClick={harvest}><Search size={13} /> Harvest</button>
          <span style={{ fontSize: 12, color: 'var(--muted,#888)', marginLeft: 4 }}>{running ? '● ' : ''}{status}</span>
        </div>
      </div>

      {/* live view mounts */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <Mount r={slot0} tint={split ? '#f23a17' : undefined} />
        {split && <Mount r={slot1} tint="#1f78c8" />}
      </div>

      {/* action bar */}
      <div style={{ borderTop: '1px solid var(--line,rgba(0,0,0,.11))', background: 'var(--bg,#fff)', padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 10, minHeight: 56 }}>
        {firstNeed ? (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{firstNeed.label}</div>
              <div style={{ fontSize: 11, color: 'var(--muted,#888)' }}>affects {firstNeed.jobCount} job{firstNeed.jobCount === 1 ? '' : 's'} · remembered</div>
            </div>
            {firstNeed.options && firstNeed.options.length ? firstNeed.options.map((o) => (
              <button key={o} style={btn} disabled={busy} onClick={() => answer(o)}>{o}</button>
            )) : (
              <>
                <input style={{ ...input, width: 220 }} value={ans} onChange={(e) => setAns(e.target.value)} placeholder="Your answer" onKeyDown={(e) => { if (e.key === 'Enter') answer(ans); }} />
                <button style={{ ...btn, background: 'var(--ink,#111)', color: '#fff', borderColor: 'var(--ink,#111)' }} disabled={busy} onClick={() => answer(ans)}><Check size={13} /> Save</button>
              </>
            )}
          </>
        ) : nextReady ? (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{nextReady.company || 'Unknown'} — {nextReady.title || 'Role'}</div>
              <div style={{ fontSize: 11, color: 'var(--muted,#888)' }}>{nextReady.filledCount} fields filled · ready to submit</div>
            </div>
            {readyCount > 1 && <button style={btn} disabled={busy} onClick={approveAll}><Send size={13} /> Approve all ({readyCount})</button>}
            <button style={{ ...btn, background: 'var(--accent,#f23a17)', color: '#fff', borderColor: 'var(--accent,#f23a17)' }} disabled={busy} onClick={() => approve(nextReady.id)}><Send size={13} /> Approve &amp; submit</button>
          </>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--muted,#888)' }}>{running ? status : 'Nothing waiting on you. Run autopilot or add a saved search.'}</div>
        )}
      </div>
    </div>
  );
};

// ── Core rail (right): everything aplyd knows ────────────────────────────────
const CORE_TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'answers', label: 'Answers' },
  { id: 'assets', label: 'Assets' },
  { id: 'voice', label: 'Voice' },
  { id: 'letters', label: 'Letters' },
  { id: 'rules', label: 'Rules' },
] as const;
type CoreTab = (typeof CORE_TABS)[number]['id'];

const CoreRail: React.FC<{ core: CoreData; settings: AutopilotSettings | null; reloadDrive: () => void }> = ({ core, settings, reloadDrive }) => {
  const [tab, setTab] = useState<CoreTab>('profile');
  const saveSettings = async (patch: Partial<AutopilotSettings>) => { await window.electronAPI.settings.set(patch); reloadDrive(); };
  // little count badges per tab
  const counts: Record<CoreTab, number | null> = {
    profile: null, answers: core.answers.length, assets: core.docs.length + core.links.length,
    voice: core.notes.length, letters: core.letters.length, rules: null,
  };
  return (
    <div style={{ width: 326, flex: 'none', borderLeft: '1px solid var(--line,rgba(0,0,0,.11))', background: '#f4f3ef', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '12px 14px 6px' }}>
        <h2 style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--muted,#888)' }}>Core · what aplyd knows</h2>
      </div>
      {/* tab strip (horizontally scrollable) */}
      <div style={{ display: 'flex', gap: 2, overflowX: 'auto', padding: '2px 10px 8px', borderBottom: '1px solid var(--line,rgba(0,0,0,.1))' }}>
        {CORE_TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '5px 9px', borderRadius: 7, border: 'none', cursor: 'pointer',
              color: tab === t.id ? '#fff' : 'var(--muted,#888)', background: tab === t.id ? 'var(--ink,#111)' : 'transparent' }}>
            {t.label}{counts[t.id] != null && <span style={{ fontSize: 9, opacity: 0.8 }}>{counts[t.id]}</span>}
          </button>
        ))}
      </div>
      {/* one panel at a time, scrolls internally */}
      <div style={{ overflow: 'auto', padding: '10px 12px 16px', flex: 1 }}>
        {tab === 'profile' && <ProfileSection />}
        {tab === 'answers' && <AnswerBankSection answers={core.answers} reload={core.reload} />}
        {tab === 'assets' && <>
          <DocumentLockerSection docs={core.docs} reload={core.reload} />
          <PortfolioSection links={core.links} reload={core.reload} />
        </>}
        {tab === 'voice' && <VoiceSection notes={core.notes} reload={core.reload} />}
        {tab === 'letters' && <CoverLetterSection letters={core.letters} reload={core.reload} />}
        {tab === 'rules' && settings && (
          <div style={card}>
            <SectionHead icon={<Brain size={15} />} title="Run rules" count={settings.dailyTarget} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, margin: '6px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={settings.enabled} onChange={(e) => saveSettings({ enabled: e.target.checked })} /> Daily auto-run
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted,#888)' }}>
              <label>at <input type="time" value={settings.runTime} onChange={(e) => saveSettings({ runTime: e.target.value })} style={{ ...input, width: 96, display: 'inline-block', padding: '4px 6px' }} /></label>
              <label>target <input type="number" min={1} max={200} value={settings.dailyTarget} onChange={(e) => saveSettings({ dailyTarget: Number(e.target.value) })} style={{ ...input, width: 56, display: 'inline-block', padding: '4px 6px' }} /></label>
              <label>min fit <input type="number" min={0} max={100} value={settings.minFit} onChange={(e) => saveSettings({ minFit: Number(e.target.value) })} style={{ ...input, width: 52, display: 'inline-block', padding: '4px 6px' }} /></label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Cockpit: the autonomous-drive control center ─────────────────────────────
const STATE_LABEL: Record<string, string> = {
  queued: 'Queued', filling: 'Filling', needs_input: 'Needs you', ready: 'Ready',
  approved: 'Approving', submitting: 'Submitting', submitted: 'Submitted',
  logged: 'Logged', skipped: 'Skipped', failed: 'Failed',
};

const BOARD_OPTS = [
  { id: 'linkedin', label: 'LinkedIn', gran: 'minute' },
  { id: 'indeed', label: 'Indeed (AU)', gran: 'day' },
  { id: 'seek', label: 'Seek (AU)', gran: 'day' },
  { id: 'glassdoor', label: 'Glassdoor', gran: 'day' },
  { id: 'ziprecruiter', label: 'ZipRecruiter', gran: 'day' },
  { id: 'adzuna', label: 'Adzuna (AU)', gran: 'day' },
  { id: 'jora', label: 'Jora (AU)', gran: 'day' },
  { id: 'weworkremotely', label: 'We Work Remotely', gran: 'none' },
];
// max-age choices in minutes (0 = any)
const AGE_OPTS = [
  { v: 0, label: 'Any time' }, { v: 5, label: '5 min' }, { v: 15, label: '15 min' }, { v: 30, label: '30 min' },
  { v: 60, label: '1 hour' }, { v: 180, label: '3 hours' }, { v: 720, label: '12 hours' },
  { v: 1440, label: '24 hours' }, { v: 4320, label: '3 days' }, { v: 10080, label: '7 days' },
];
const ageLabel = (m: number) => AGE_OPTS.find((a) => a.v === m)?.label || `${m}m`;

const CockpitSection: React.FC = () => {
  const [jobs, setJobs] = useState<AutopilotJob[]>([]);
  const [needs, setNeeds] = useState<AutopilotNeed[]>([]);
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [settings, setSettings] = useState<AutopilotSettings | null>(null);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('Idle');
  const [urls, setUrls] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const s = await drive().status();
    setJobs(s.jobs); setNeeds(s.needs); setRunning(s.running);
    setSearches(await window.electronAPI.search.getAll());
    setSettings(await window.electronAPI.settings.get());
  };
  useEffect(() => {
    refresh();
    const off = drive().onProgress((st: DriveStatus) => {
      setRunning(st.running); setStatus(st.message);
      drive().getJobs().then(setJobs);
      drive().getNeeds().then(setNeeds);
    });
    const t = setInterval(refresh, 4000);
    return () => { off(); clearInterval(t); };
  }, []);

  const saveSettings = async (patch: Partial<AutopilotSettings>) => { setSettings(await window.electronAPI.settings.set(patch)); };

  const enqueue = async () => {
    const list = urls.split(/[\s,]+/).map((u) => u.trim()).filter((u) => /^https?:\/\//.test(u));
    if (!list.length) return;
    setBusy(true);
    await drive().enqueue(list);
    setUrls('');
    await refresh();
    setBusy(false);
  };
  const run = async () => { await drive().runFull(); setRunning(true); };
  const harvest = async () => { await drive().harvest(); setRunning(true); };
  const stop = async () => { await drive().stop(); };
  const approve = async (id: string) => { setBusy(true); await drive().approve(id); await refresh(); setBusy(false); };
  const approveAll = async () => { setBusy(true); await drive().approveAll(); await refresh(); setBusy(false); };

  const count = (s: string) => jobs.filter((j) => j.state === s).length;
  const ready = jobs.filter((j) => j.state === 'ready');
  const needsJobs = jobs.filter((j) => j.state === 'needs_input');
  const failed = jobs.filter((j) => j.state === 'failed');
  const active = jobs.filter((j) => ['queued', 'filling', 'approved', 'submitting'].includes(j.state));
  const done = jobs.filter((j) => ['submitted', 'logged'].includes(j.state));

  const pipeline: [string, number][] = [
    ['queued', count('queued')], ['filling', count('filling')],
    ['needs_input', needsJobs.length], ['ready', ready.length],
    ['logged', done.length], ['failed', failed.length],
  ];

  return (
    <div style={{ ...card, borderColor: 'var(--accent, #f23a17)' }}>
      <SectionHead icon={<Play size={16} />} title="Cockpit" count={jobs.length} />
      <p style={{ fontSize: 12, opacity: 0.6, marginTop: 0 }}>
        Sources jobs across boards, fit-scores them, fills the best, then waits for your review. It never auto-submits.
      </p>

      {/* settings bar: master toggle + targets + schedule */}
      {settings && (
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', marginBottom: 12, borderRadius: 10, border: '1px solid var(--ink, rgba(0,0,0,.12))' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            <input type="checkbox" checked={settings.enabled} onChange={(e) => saveSettings({ enabled: e.target.checked })} />
            Daily auto-run
          </label>
          <label style={{ fontSize: 12, opacity: 0.8 }}>at <input type="time" value={settings.runTime} onChange={(e) => saveSettings({ runTime: e.target.value })} style={{ ...input, width: 110, display: 'inline-block', padding: '4px 6px' }} /></label>
          <label style={{ fontSize: 12, opacity: 0.8 }}>Target/day <input type="number" min={1} max={200} value={settings.dailyTarget} onChange={(e) => saveSettings({ dailyTarget: Number(e.target.value) })} style={{ ...input, width: 64, display: 'inline-block', padding: '4px 6px' }} /></label>
          <label style={{ fontSize: 12, opacity: 0.8 }}>Min fit <input type="number" min={0} max={100} value={settings.minFit} onChange={(e) => saveSettings({ minFit: Number(e.target.value) })} style={{ ...input, width: 56, display: 'inline-block', padding: '4px 6px' }} /></label>
        </div>
      )}

      {/* saved searches */}
      <SavedSearchManager searches={searches} reload={refresh} onHarvest={harvest} running={running} />

      {/* run controls */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 12 }}>
        <textarea
          value={urls} onChange={(e) => setUrls(e.target.value)}
          placeholder="Paste job URLs (one per line) — LinkedIn, Greenhouse, Lever, any ATS"
          style={{ ...input, minHeight: 64, resize: 'vertical', fontFamily: 'inherit' }}
        />
        <button style={{ ...btn, whiteSpace: 'nowrap' }} onClick={enqueue} disabled={busy}>
          <Plus size={14} /> Queue
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        {running
          ? <button style={{ ...btn, borderColor: 'var(--accent, #f23a17)', color: 'var(--accent, #f23a17)' }} onClick={stop}><Square size={13} /> Stop</button>
          : <button style={{ ...btn, background: 'var(--accent, #f23a17)', color: '#fff', borderColor: 'var(--accent, #f23a17)' }} onClick={run} disabled={!active.length && !searches.some((s) => s.enabled)}><Play size={13} /> Run now</button>}
        {ready.length > 0 && (
          <button style={{ ...btn }} onClick={approveAll} disabled={busy}><Send size={13} /> Submit all ({ready.length})</button>
        )}
        <span style={{ fontSize: 12, opacity: 0.65, marginLeft: 4 }}>{running ? '● ' : ''}{status}</span>
      </div>

      {/* pipeline counts */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {pipeline.map(([s, n]) => (
          <span key={s} style={{ ...tagChip, opacity: n ? 0.9 : 0.4, borderColor: s === 'ready' ? 'var(--accent, #f23a17)' : undefined }}>
            {STATE_LABEL[s]} {n}
          </span>
        ))}
      </div>

      {/* Needs you inbox */}
      {needs.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
            <Inbox size={14} /> Needs you ({needs.length})
          </div>
          {needs.map((n) => <NeedRow key={n.id} need={n} onAnswered={refresh} />)}
        </div>
      )}

      {/* Ready to submit */}
      {ready.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Ready to submit ({ready.length})</div>
          {ready.map((j) => <ReadyCard key={j.id} job={j} onApprove={() => approve(j.id)} busy={busy} />)}
        </div>
      )}

      {/* Active / queued */}
      {active.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>In progress ({active.length})</div>
          {active.map((j) => <JobRow key={j.id} job={j} />)}
        </div>
      )}

      {/* Failed */}
      {failed.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, marginBottom: 8, opacity: 0.8 }}>
            <AlertTriangle size={14} /> Couldn't apply ({failed.length})
          </div>
          {failed.map((j) => <JobRow key={j.id} job={j} />)}
        </div>
      )}

      {done.length > 0 && (
        <button style={{ ...btn, fontSize: 12, opacity: 0.7 }} onClick={async () => { await drive().clearFinished(); refresh(); }}>
          <RotateCcw size={12} /> Clear {done.length} submitted
        </button>
      )}

      {jobs.length === 0 && (
        <p style={{ fontSize: 12, opacity: 0.55, margin: '6px 0 0' }}>
          Queue some job URLs, then hit Run. aplyd opens its own Chrome window (log in there once), fills each form
          from your Answer bank, parks anything it doesn't know in <b>Needs you</b>, and stops at review so you approve
          before anything sends.
        </p>
      )}
    </div>
  );
};

const NeedRow: React.FC<{ need: AutopilotNeed; onAnswered: () => void }> = ({ need, onAnswered }) => {
  const [val, setVal] = useState('');
  const save = async (v: string) => { if (!v.trim()) return; await drive().answerNeed(need.id, v.trim()); onAnswered(); };
  return (
    <div style={{ border: '1px solid var(--ink, rgba(0,0,0,.12))', borderRadius: 10, padding: 10, marginBottom: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{need.label}</div>
      <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 8 }}>
        affects {need.jobCount} queued job{need.jobCount === 1 ? '' : 's'}{need.hint ? ` · ${need.hint}` : ''} · remembered for next time
      </div>
      {need.options && need.options.length > 0 ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {need.options.map((o) => (
            <button key={o} style={{ ...btn, fontSize: 12 }} onClick={() => save(o)}>{o}</button>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          <input style={input} value={val} onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(val); }} placeholder="Your answer" />
          <button style={btn} onClick={() => save(val)}><Check size={13} /></button>
        </div>
      )}
    </div>
  );
};

const ReadyCard: React.FC<{ job: AutopilotJob; onApprove: () => void; busy: boolean }> = ({ job, onApprove, busy }) => {
  const [shot, setShot] = useState<string | null>(null);
  useEffect(() => { if (job.screenshotPath) drive().shot(job.screenshotPath).then(setShot); }, [job.screenshotPath]);
  return (
    <div style={{ border: '1px solid var(--accent, #f23a17)', borderRadius: 10, padding: 10, marginBottom: 10, display: 'flex', gap: 12 }}>
      {shot && <img src={shot} alt="" style={{ width: 120, height: 78, objectFit: 'cover', objectPosition: 'top', borderRadius: 6, border: '1px solid var(--ink, rgba(0,0,0,.15))' }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
          {job.company || 'Unknown'}
          {job.fitScore != null && <span style={{ ...tagChip, opacity: 0.85 }}>fit {job.fitScore}</span>}
        </div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>{job.title || 'Role'}</div>
        <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>{job.filledCount} fields filled{job.fitReason ? ` · ${job.fitReason}` : ''}</div>
        <a href={job.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, opacity: 0.5, textDecoration: 'none', color: 'inherit' }}>{job.url.slice(0, 54)}</a>
      </div>
      <button style={{ ...btn, alignSelf: 'center', background: 'var(--accent, #f23a17)', color: '#fff', borderColor: 'var(--accent, #f23a17)' }} onClick={onApprove} disabled={busy}>
        <Send size={13} /> Submit
      </button>
    </div>
  );
};

const JobRow: React.FC<{ job: AutopilotJob }> = ({ job }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--ink, rgba(0,0,0,.06))' }}>
    <span style={{ ...tagChip, opacity: 0.8 }}>{STATE_LABEL[job.state] || job.state}</span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {job.company || job.url.replace(/^https?:\/\//, '').slice(0, 50)}
      </div>
      {job.error && <div style={{ fontSize: 11, color: 'var(--accent, #c0392b)', opacity: 0.85 }}>{job.error}</div>}
    </div>
    <button style={{ ...btn, padding: 6 }} onClick={() => drive().deleteJob(job.id)}><Trash2 size={13} /></button>
  </div>
);

const SavedSearchManager: React.FC<{ searches: SavedSearch[]; reload: () => void; onHarvest: () => void; running: boolean }> = ({ searches, reload, onHarvest, running }) => {
  const [board, setBoard] = useState('linkedin');
  const [query, setQuery] = useState('');
  const [loc, setLoc] = useState('');
  const [age, setAge] = useState(0);
  const boardGran = (id: string) => BOARD_OPTS.find((b) => b.id === id)?.gran;
  const add = async () => {
    if (!query.trim()) return;
    await window.electronAPI.search.add(board, query.trim(), loc.trim(), age);
    setQuery(''); setLoc(''); reload();
  };
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
        <Search size={14} /> Saved searches
        {searches.some((s) => s.enabled) && (
          <button style={{ ...btn, padding: '3px 8px', fontSize: 11, marginLeft: 'auto' }} onClick={onHarvest} disabled={running}>Harvest now</button>
        )}
      </div>
      {searches.map((s) => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
          <input type="checkbox" checked={s.enabled} onChange={(e) => { window.electronAPI.search.setEnabled(s.id, e.target.checked).then(reload); }} />
          <span style={{ ...tagChip, opacity: 0.7 }}>{BOARD_OPTS.find((b) => b.id === s.board)?.label || s.board}</span>
          <span style={{ flex: 1, fontSize: 13 }}>{s.query}{s.location ? <span style={{ opacity: 0.55 }}> · {s.location}</span> : null}</span>
          {s.maxAgeMinutes > 0 && <span style={{ ...tagChip, opacity: 0.7 }}>≤ {ageLabel(s.maxAgeMinutes)}</span>}
          <button style={{ ...btn, padding: 6 }} onClick={() => window.electronAPI.search.delete(s.id).then(reload)}><Trash2 size={13} /></button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <select value={board} onChange={(e) => setBoard(e.target.value)} style={{ ...input, width: 130 }}>
          {BOARD_OPTS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
        </select>
        <input style={{ ...input, flex: 1, minWidth: 140 }} placeholder="Role / keywords" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <input style={{ ...input, width: 130 }} placeholder="Location" value={loc} onChange={(e) => setLoc(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <select value={age} onChange={(e) => setAge(Number(e.target.value))} style={{ ...input, width: 110 }} title="Only harvest jobs posted within this window">
          {AGE_OPTS.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}
        </select>
        <button style={btn} onClick={add}><Plus size={14} /></button>
      </div>
      {age > 0 && age < 1440 && boardGran(board) === 'day' && (
        <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4 }}>
          Note: {BOARD_OPTS.find((b) => b.id === board)?.label} only filters by day, so this rounds to "today, newest first." Only LinkedIn honours sub-day windows.
        </div>
      )}
      {boardGran(board) === 'none' && age > 0 && (
        <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4 }}>
          Note: {BOARD_OPTS.find((b) => b.id === board)?.label} has no date filter; results are simply newest-first.
        </div>
      )}
    </div>
  );
};

// ── Structured profile (Core) ────────────────────────────────────────────────
const PROFILE_FIELDS = ['Legal first name', 'Legal last name', 'Preferred name', 'Email', 'Phone', 'Location', 'Work authorization', 'Require visa sponsorship', 'Years of experience', 'Current title', 'LinkedIn', 'GitHub', 'Portfolio', 'Salary expectation', 'Notice period', 'Open to remote'];
// Hints shown under the name fields so the distinction is obvious.
const FIELD_HINT: Record<string, string> = {
  'Legal first name': 'real/ID name used for official fields (e.g. Arkah Mynn)',
  'Legal last name': 'real/ID surname (e.g. Nwe)',
  'Preferred name': 'the name you go by, used only when a form asks for it (e.g. Violet)',
};

const ProfileSection: React.FC = () => {
  const [profile, setProfile] = useState<Record<string, string>>({});
  const [seeding, setSeeding] = useState(false);
  const [saved, setSaved] = useState(false);
  const load = async () => setProfile(await window.electronAPI.profile.get());
  useEffect(() => { load(); }, []);
  const setField = (k: string, v: string) => setProfile((p) => ({ ...p, [k]: v }));
  const save = async () => { await window.electronAPI.profile.set(profile); setSaved(true); window.setTimeout(() => setSaved(false), 1400); };
  // Persist whatever's typed FIRST so the seed merge (which keeps your values)
  // never overrides an edit you hadn't clicked away from yet.
  const seed = async () => {
    setSeeding(true);
    await window.electronAPI.profile.set(profile);
    const merged = await window.electronAPI.profile.seed();
    setProfile(merged); setSeeding(false);
  };
  const keys = Array.from(new Set([...PROFILE_FIELDS, ...Object.keys(profile)]));
  return (
    <section style={card}>
      <SectionHead icon={<Brain size={16} />} title="Profile" count={Object.values(profile).filter(Boolean).length}
        action={<button style={btn} onClick={seed} disabled={seeding}><Wand2 size={14} /> {seeding ? 'Reading resume…' : 'Seed from resume'}</button>} />
      <p style={{ fontSize: 12, opacity: 0.6, marginTop: 0 }}>
        Autosaves as you type. Filled instantly during autopilot. <b>Seed from resume</b> only fills blank fields — it never overrides what you've entered.
        {saved && <span style={{ color: '#1f9d55', fontWeight: 700 }}> · Saved</span>}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
        {keys.map((k) => (
          <label key={k} style={{ fontSize: 11, opacity: 0.85, gridColumn: FIELD_HINT[k] ? '1 / -1' : undefined }}>
            <div style={{ marginBottom: 3, fontWeight: 600 }}>{k}</div>
            <input style={input} value={profile[k] || ''} onChange={(e) => setField(k, e.target.value)} onBlur={save} />
            {FIELD_HINT[k] && <div style={{ fontSize: 10, opacity: 0.55, marginTop: 2 }}>{FIELD_HINT[k]}</div>}
          </label>
        ))}
      </div>
    </section>
  );
};

// ── Portfolio links ──────────────────────────────────────────────────────────
const PortfolioSection: React.FC<{ links: PortfolioLink[]; reload: () => void }> = ({ links, reload }) => {
  const [label, setLabel] = useState('');
  const [urlVal, setUrlVal] = useState('');

  const save = async () => {
    let u = urlVal.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    await api().addPortfolioLink(label.trim() || 'Portfolio', u);
    setLabel(''); setUrlVal(''); reload();
  };

  return (
    <section style={card}>
      <SectionHead icon={<Link2 size={16} />} title="Portfolio links" count={links.length} />
      <p style={{ fontSize: 12, opacity: 0.6, marginTop: 0 }}>
        Your portfolio is a live site, so add it as a link. Claude visits it when writing cover letters and answers,
        pulling in real work so each one is grounded in what you've actually built.
      </p>

      <div style={{ display: 'grid', gap: 8, margin: '10px 0', padding: 12, border: '1px dashed var(--ink, rgba(0,0,0,.2))', borderRadius: 10 }}>
        <input style={input} placeholder='Label (e.g. "Portfolio site", "GitHub")' value={label} onChange={(e) => setLabel(e.target.value)} />
        <input style={input} placeholder='https://your-portfolio.com' value={urlVal} onChange={(e) => setUrlVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
        <div><button style={{ ...btn, fontWeight: 700 }} onClick={save} disabled={!urlVal.trim()}>Add link</button></div>
      </div>

      {links.length === 0 && <Empty>No links yet. Add your portfolio website so Claude can reference it.</Empty>}
      {links.map((l) => (
        <Row key={l.id} onDelete={async () => { await api().deletePortfolioLink(l.id); reload(); }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{l.label}</div>
          <a href={l.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent, #2563eb)', textDecoration: 'none', wordBreak: 'break-all' }}>{l.url}</a>
        </Row>
      ))}
    </section>
  );
};

// ── Cover-letter vault + studio ──────────────────────────────────────────────
const CoverLetterSection: React.FC<{ letters: CoverLetter[]; reload: () => void }> = ({ letters, reload }) => {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CoverLetter | null>(null);

  return (
    <section style={card}>
      <SectionHead icon={<PenLine size={16} />} title="Cover-letter vault" count={letters.length}
        action={<button style={btn} onClick={() => { setEditing(null); setOpen((v) => !v); }}><Plus size={14} /> New</button>} />
      <p style={{ fontSize: 12, opacity: 0.6, marginTop: 0 }}>
        When a role wants a cover letter, draft it here with Claude (tailored to the role, grounded in your resume +
        portfolio), refine it together with feedback, then save the perfected version to the vault. Already have your
        own for a role? Paste it straight in. Your feedback teaches your <b>Voice</b> for next time.
      </p>

      {(open || editing) && (
        <CoverLetterStudio
          existing={editing}
          onClose={() => { setOpen(false); setEditing(null); }}
          onSaved={() => { setOpen(false); setEditing(null); reload(); }}
        />
      )}

      {letters.length === 0 && !open && <Empty>No saved cover letters yet. Hit “New” to draft one with Claude.</Empty>}
      {letters.map((l) => (
        <Row key={l.id} onDelete={async () => { await api().deleteCoverLetter(l.id); reload(); }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{l.role} <span style={{ opacity: 0.5 }}>· {l.company}</span></span>
            {l.isFinal && <span style={{ ...tagChip, opacity: 1, borderColor: 'var(--accent, currentColor)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Lock size={9} /> final</span>}
          </div>
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{l.body}</div>
          <button style={{ ...btn, marginTop: 6, padding: '4px 10px', fontSize: 12 }} onClick={() => { setOpen(false); setEditing(l); }}>Open</button>
        </Row>
      ))}
    </section>
  );
};

const CoverLetterStudio: React.FC<{ existing: CoverLetter | null; onClose: () => void; onSaved: () => void }> = ({ existing, onClose, onSaved }) => {
  const [company, setCompany] = useState(existing?.company || '');
  const [role, setRole] = useState(existing?.role || '');
  const [jobText, setJobText] = useState('');
  const [body, setBody] = useState(existing?.body || '');
  const [feedback, setFeedback] = useState('');
  const [remember, setRemember] = useState(true);
  const [isFinal, setIsFinal] = useState(existing?.isFinal || false);
  const [busy, setBusy] = useState<'' | 'gen' | 'refine'>('');

  const generate = async () => {
    if (!company.trim() || !role.trim()) return;
    setBusy('gen');
    try { const { body: b } = await api().generateCoverLetter({ company: company.trim(), role: role.trim(), jobText: jobText.trim() || undefined }); setBody(b); }
    finally { setBusy(''); }
  };
  const refine = async () => {
    if (!body.trim() || !feedback.trim()) return;
    setBusy('refine');
    try {
      const { body: b } = await api().refineCoverLetter({ company: company.trim(), role: role.trim(), body, feedback: feedback.trim(), remember });
      setBody(b); setFeedback('');
    } finally { setBusy(''); }
  };
  const save = async () => {
    if (!company.trim() || !role.trim() || !body.trim()) return;
    await api().saveCoverLetter({ id: existing?.id, company: company.trim(), role: role.trim(), body, isFinal, jobUrl: existing?.jobUrl ?? null });
    onSaved();
  };

  return (
    <div style={{ display: 'grid', gap: 10, margin: '10px 0', padding: 14, border: '1px dashed var(--ink, rgba(0,0,0,.25))', borderRadius: 10 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={input} placeholder="Role" value={role} onChange={(e) => setRole(e.target.value)} />
        <input style={input} placeholder="Company" value={company} onChange={(e) => setCompany(e.target.value)} />
      </div>
      <textarea style={{ ...input, minHeight: 56, resize: 'vertical', fontFamily: 'inherit' }}
        placeholder="Paste the job description (optional, makes tailoring sharper)" value={jobText} onChange={(e) => setJobText(e.target.value)} />
      <div>
        <button style={{ ...btn, fontWeight: 700 }} onClick={generate} disabled={busy !== '' || !company.trim() || !role.trim()}>
          <Wand2 size={14} /> {busy === 'gen' ? 'Writing…' : body ? 'Regenerate' : 'Draft with Claude'}
        </button>
        <span style={{ fontSize: 11, opacity: 0.5, marginLeft: 10 }}>or paste your own below</span>
      </div>

      <textarea style={{ ...input, minHeight: 200, resize: 'vertical', lineHeight: 1.55, fontFamily: 'inherit' }}
        placeholder="Your cover letter will appear here. You can edit it directly too." value={body} onChange={(e) => setBody(e.target.value)} />

      <div style={{ display: 'grid', gap: 6, padding: 10, border: '1px solid var(--ink, rgba(0,0,0,.12))', borderRadius: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8 }}>Refine with feedback</div>
        <textarea style={{ ...input, minHeight: 48, resize: 'vertical', fontFamily: 'inherit' }}
          placeholder='e.g. "Less formal, cut the third paragraph, mention my volleyball app"' value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button style={btn} onClick={refine} disabled={busy !== '' || !body.trim() || !feedback.trim()}>{busy === 'refine' ? 'Refining…' : 'Refine'}</button>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, opacity: 0.8 }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember this feedback for future letters
          </label>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button style={{ ...btn, fontWeight: 700 }} onClick={save} disabled={!body.trim() || !company.trim() || !role.trim()}>Save to vault</button>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, opacity: 0.8 }}>
          <input type="checkbox" checked={isFinal} onChange={(e) => setIsFinal(e.target.checked)} /> Mark as final
        </label>
        <button style={{ ...btn, border: 'none', opacity: 0.6 }} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
};

// ── Answer bank ──────────────────────────────────────────────────────────────
// Compact, searchable answer bank: one-line rows, click a row to expand + edit.
const AnswerBankSection: React.FC<{ answers: AnswerBankEntry[]; reload: () => void }> = ({ answers, reload }) => {
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [context, setContext] = useState('');

  const save = async () => {
    if (!label.trim() || !value.trim()) return;
    await api().upsertAnswer({ label: label.trim(), value: value.trim(), context: context.trim() || null, patterns: [] });
    setLabel(''); setValue(''); setContext(''); setAdding(false); reload();
  };

  const s = q.trim().toLowerCase();
  const filtered = !s ? answers : answers.filter((a) =>
    a.label.toLowerCase().includes(s) || (a.value || '').toLowerCase().includes(s) || (a.context || '').toLowerCase().includes(s));

  return (
    <section style={card}>
      <SectionHead icon={<Brain size={16} />} title="Answer bank" count={answers.length}
        action={<button style={btn} onClick={() => setAdding((v) => !v)}><Plus size={14} /> Add</button>} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, border: '1px solid var(--ink, rgba(0,0,0,.18))', borderRadius: 8, padding: '6px 9px', margin: '8px 0' }}>
        <Search size={13} style={{ opacity: 0.5, flex: 'none' }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search answers…"
          style={{ border: 'none', outline: 'none', background: 'none', color: 'var(--ink, inherit)', fontSize: 12, width: '100%' }} />
        {q && <span onClick={() => setQ('')} style={{ cursor: 'pointer', opacity: 0.5, fontSize: 12 }}>✕</span>}
      </div>

      {adding && (
        <div style={{ display: 'grid', gap: 8, margin: '10px 0', padding: 12, border: '1px dashed var(--ink, rgba(0,0,0,.2))', borderRadius: 10 }}>
          <input style={input} placeholder='Label (e.g. "Legal name")' value={label} onChange={(e) => setLabel(e.target.value)} />
          <input style={input} placeholder='Value (e.g. "Arkah Mynn Nwe")' value={value} onChange={(e) => setValue(e.target.value)} />
          <input style={input} placeholder='When to use it (optional)' value={context} onChange={(e) => setContext(e.target.value)} />
          <div><button style={{ ...btn, fontWeight: 700 }} onClick={save}>Save</button></div>
        </div>
      )}

      {answers.length === 0 && <Empty>No saved answers yet. They build up as autopilot applies (and from answers you give in the workspace).</Empty>}
      {answers.length > 0 && filtered.length === 0 && <div style={{ fontSize: 12, opacity: 0.5, padding: '8px 2px' }}>No matches for “{q}”.</div>}
      <div>{filtered.map((a) => <CompactAnswerRow key={a.id} a={a} reload={reload} />)}</div>
    </section>
  );
};

const CompactAnswerRow: React.FC<{ a: AnswerBankEntry; reload: () => void }> = ({ a, reload }) => {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [label, setLabel] = useState(a.label);
  const [value, setValue] = useState(a.value);
  const [context, setContext] = useState(a.context || '');
  const saveEdit = async () => {
    if (!label.trim() || !value.trim()) return;
    await api().upsertAnswer({ id: a.id, label: label.trim(), value: value.trim(), context: context.trim() || null, patterns: a.patterns || [] });
    setOpen(false); reload();
  };
  const del = async (e: React.MouseEvent) => { e.stopPropagation(); await api().deleteAnswer(a.id); reload(); };
  return (
    <div style={{ borderTop: '1px solid var(--ink, rgba(0,0,0,.08))' }}>
      <div onClick={() => setOpen((v) => !v)} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 2px', cursor: 'pointer', fontSize: 12 }}>
        <span style={{ flex: 1, minWidth: 0, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.label}</span>
        {!open && <span style={{ color: 'var(--muted, #888)', maxWidth: 92, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.value}</span>}
        <span onClick={del} title="Delete" style={{ opacity: hover ? 0.6 : 0, transition: 'opacity .12s', display: 'flex' }}><Trash2 size={13} /></span>
      </div>
      {open && (
        <div style={{ display: 'grid', gap: 6, padding: '2px 2px 10px' }}>
          <input style={input} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" />
          <input style={input} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value" />
          <input style={input} value={context} onChange={(e) => setContext(e.target.value)} placeholder="When to use it (optional)" />
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={{ ...btn, fontWeight: 700 }} onClick={saveEdit}><Check size={13} /> Save</button>
            <button style={{ ...btn, color: 'var(--muted,#888)' }} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Document locker ──────────────────────────────────────────────────────────
const DOC_TYPES: { tag: string; label: string; hint: string; single?: boolean }[] = [
  { tag: 'resume', label: 'Resume', hint: 'Your main CV. Claude grounds letters and answers in this, and the extension attaches it to resume uploads.', single: true },
  { tag: 'cover-letter', label: 'Cover-letter files', hint: 'Pre-written letters you already have. (The vault below drafts new ones with Claude.)' },
  { tag: 'transcript', label: 'Transcript', hint: 'Academic records, attached only when a form asks for one.', single: true },
  { tag: 'portfolio', label: 'Portfolio file', hint: 'A PDF portfolio. If yours is a live website, add it under Portfolio links instead.' },
  { tag: 'other', label: 'Other', hint: 'Anything else (references, certifications…).' },
];

const DocumentLockerSection: React.FC<{ docs: LockerDocument[]; reload: () => void }> = ({ docs, reload }) => {
  const [active, setActive] = useState(DOC_TYPES[0].tag);
  const activeType = DOC_TYPES.find((t) => t.tag === active) || DOC_TYPES[0];
  const activeDocs = docs.filter((d) => d.tags.includes(active));

  return (
    <section style={card}>
      <SectionHead icon={<FileText size={16} />} title="Document locker" count={docs.length} />
      <p style={{ fontSize: 12, opacity: 0.6, marginTop: 0, marginBottom: 12 }}>
        Pick a topic, attach its files. A tick means that topic has something on file. The extension attaches the
        right one to each upload; everything persists between sessions.
      </p>

      {/* horizontal topic tabs — compact, with a tick when the topic has files */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {DOC_TYPES.map((t) => {
          const has = docs.some((d) => d.tags.includes(t.tag));
          const on = t.tag === active;
          return (
            <button key={t.tag} onClick={() => setActive(t.tag)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999,
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${on ? 'var(--accent, currentColor)' : 'var(--ink, rgba(0,0,0,.2))'}`,
                background: on ? 'var(--accent, rgba(0,0,0,.06))' : 'transparent',
                color: on ? 'var(--accent-ink, var(--ink, inherit))' : 'var(--ink, inherit)',
                opacity: on ? 1 : 0.7,
              }}>
              {t.label}
              {has && <Check size={13} style={{ color: 'var(--accent, #067647)' }} />}
            </button>
          );
        })}
      </div>

      <DocTypePanel type={activeType} docs={activeDocs} reload={reload} />
    </section>
  );
};

const DocTypePanel: React.FC<{ type: { tag: string; label: string; hint: string; single?: boolean }; docs: LockerDocument[]; reload: () => void }> = ({ type, docs, reload }) => {
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // clear any transient status when the active topic changes
  useEffect(() => { setStatus(null); }, [type.tag]);

  const attach = async () => {
    setStatus(null);
    const p = await api().pickDocument();
    if (!p) return; // cancelled
    setBusy(true);
    try {
      // single-file types (resume, transcript) replace the old file rather than stack.
      if (type.single) { for (const d of docs) await api().deleteDocument(d.id); }
      const name = p.split('/').pop() || type.label;
      await api().addDocument(name, p, [type.tag], true);
      setStatus({ kind: 'ok', msg: `${type.single && docs.length ? 'Replaced with' : 'Added'} ${name}` });
      reload();
    } catch (e: any) {
      setStatus({ kind: 'err', msg: 'Could not save: ' + (e?.message || e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ border: '1px solid var(--ink, rgba(0,0,0,.12))', borderRadius: 10, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{type.label}</span>
        {docs.length > 0
          ? <span style={{ ...tagChip, opacity: 1, borderColor: 'var(--accent, currentColor)' }}>{docs.length} on file</span>
          : <span style={{ fontSize: 11, opacity: 0.45 }}>empty</span>}
        <div style={{ flex: 1 }} />
        <button style={{ ...btn, padding: '5px 11px', fontSize: 12 }} onClick={attach} disabled={busy}>
          <Plus size={13} /> {busy ? 'Adding…' : docs.length ? (type.single ? 'Replace' : 'Add another') : 'Attach file'}
        </button>
      </div>

      <div style={{ fontSize: 11, opacity: 0.5, marginTop: 6 }}>{type.hint}</div>

      {docs.map((d) => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: '1px solid var(--ink, rgba(0,0,0,.08))', marginTop: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
          {d.isDefault && <span style={{ ...tagChip, opacity: 1, borderColor: 'var(--accent, currentColor)' }}>default</span>}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 10, opacity: 0.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{d.filePath}</span>
          <button onClick={async () => { await api().deleteDocument(d.id); reload(); }} title="Remove"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', opacity: 0.45, padding: 2 }}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      {status && (
        <div style={{ fontSize: 11, marginTop: 8, color: status.kind === 'ok' ? 'var(--accent, #067647)' : '#b42318' }}>
          {status.kind === 'ok' ? '✓ ' : '⚠ '}{status.msg}
        </div>
      )}
    </div>
  );
};

// ── Voice profile ────────────────────────────────────────────────────────────
const VoiceSection: React.FC<{ notes: VoiceNote[]; reload: () => void }> = ({ notes, reload }) => {
  const [kind, setKind] = useState<VoiceNoteKind>('style');
  const [note, setNote] = useState('');
  const KINDS: VoiceNoteKind[] = ['style', 'like', 'dislike'];
  const KindIcon: React.FC<{ k: VoiceNoteKind; size?: number }> = ({ k, size = 13 }) =>
    k === 'like' ? <ThumbsUp size={size} /> : k === 'dislike' ? <ThumbsDown size={size} /> : <PenLine size={size} />;

  const save = async () => {
    if (!note.trim()) return;
    await api().addVoiceNote(kind, note.trim()); setNote(''); reload();
  };

  return (
    <section style={card}>
      <SectionHead icon={<MessageSquareHeart size={16} />} title="Voice profile" count={notes.length} />
      <p style={{ fontSize: 12, opacity: 0.6, marginTop: 0 }}>
        How you want tailored answers + cover letters to sound. Grows from your feedback (like, dislike, or a style note).
      </p>

      <div style={{ display: 'grid', gap: 8, margin: '10px 0', padding: 12, border: '1px dashed var(--ink, rgba(0,0,0,.2))', borderRadius: 10 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {KINDS.map((k) => (
            <button key={k} onClick={() => setKind(k)}
              style={{ ...tagChip, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, opacity: kind === k ? 1 : 0.5 }}>
              <KindIcon k={k} size={12} /> {k}
            </button>
          ))}
        </div>
        <input style={input} placeholder='e.g. "Avoid corporate buzzwords; lead with concrete results"' value={note} onChange={(e) => setNote(e.target.value)} />
        <div><button style={{ ...btn, fontWeight: 700 }} onClick={save}>Add</button></div>
      </div>

      {notes.length === 0 && <Empty>No preferences yet. Add one, or like/dislike a generated answer later.</Empty>}
      {notes.map((n) => (
        <Row key={n.id} onDelete={async () => { await api().deleteVoiceNote(n.id); reload(); }}>
          <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ opacity: 0.6, flexShrink: 0 }}><KindIcon k={n.kind} /></span>{n.note}
          </div>
        </Row>
      ))}
    </section>
  );
};

// ── small shared bits ────────────────────────────────────────────────────────
const SectionHead: React.FC<{ icon: React.ReactNode; title: string; count: number; action?: React.ReactNode }> =
  ({ icon, title, count, action }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      {icon}
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{title}</h2>
      <span style={{ fontSize: 12, opacity: 0.5 }}>({count})</span>
      <div style={{ flex: 1 }} />
      {action}
    </div>
  );

const Row: React.FC<{ children: React.ReactNode; onDelete: () => void }> = ({ children, onDelete }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderTop: '1px solid var(--ink, rgba(0,0,0,.08))' }}>
    <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    <button onClick={onDelete} title="Delete"
      style={{ background: 'transparent', border: 'none', cursor: 'pointer', opacity: 0.45, padding: 2 }}>
      <Trash2 size={15} />
    </button>
  </div>
);

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 12, opacity: 0.5, padding: '10px 0' }}>{children}</div>
);
