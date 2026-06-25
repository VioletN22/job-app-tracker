import React, { useState, useEffect } from 'react';
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

  return (
    <div style={{ padding: 32, maxWidth: 760, overflowY: 'auto', height: '100vh' }}>
      <header style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Sparkles size={22} />
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-.02em' }}>Autopilot</h1>
      </header>
      <p style={{ marginTop: 0, marginBottom: 24, fontSize: 13, opacity: 0.7, lineHeight: 1.5 }}>
        Fills LinkedIn Easy-Apply forms for you and learns as it goes. Known fields fill instantly from your
        <b> Answer bank</b>; new ones it asks once (then remembers). It picks the right file from your
        <b> Document locker</b>, references your <b>Portfolio</b>, drafts <b>Cover letters</b> per role, and tailors
        everything to your <b>Voice</b>. You always review and hit submit. It all lives locally and is shared with the
        browser extension.
      </p>

      <CockpitSection />
      <ProfileSection />

      <AnswerBankSection answers={answers} reload={reload} />
      <DocumentLockerSection docs={docs} reload={reload} />
      <PortfolioSection links={links} reload={reload} />
      <CoverLetterSection letters={letters} reload={reload} />
      <VoiceSection notes={notes} reload={reload} />
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
const PROFILE_FIELDS = ['Full name', 'Email', 'Phone', 'Location', 'Work authorization', 'Require visa sponsorship', 'Years of experience', 'Current title', 'LinkedIn', 'GitHub', 'Portfolio', 'Salary expectation', 'Notice period', 'Open to remote'];

const ProfileSection: React.FC = () => {
  const [profile, setProfile] = useState<Record<string, string>>({});
  const [seeding, setSeeding] = useState(false);
  const load = async () => setProfile(await window.electronAPI.profile.get());
  useEffect(() => { load(); }, []);
  const setField = (k: string, v: string) => setProfile((p) => ({ ...p, [k]: v }));
  const save = async () => { await window.electronAPI.profile.set(profile); };
  const seed = async () => { setSeeding(true); const merged = await window.electronAPI.profile.seed(); setProfile(merged); setSeeding(false); };
  const keys = Array.from(new Set([...PROFILE_FIELDS, ...Object.keys(profile)]));
  return (
    <section style={card}>
      <SectionHead icon={<Brain size={16} />} title="Profile" count={Object.values(profile).filter(Boolean).length}
        action={<button style={btn} onClick={seed} disabled={seeding}><Wand2 size={14} /> {seeding ? 'Reading resume…' : 'Seed from resume'}</button>} />
      <p style={{ fontSize: 12, opacity: 0.6, marginTop: 0 }}>
        The standard fields every ATS asks. Filled instantly during autopilot. Seed pulls what it can from your resume; edit anything.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
        {keys.map((k) => (
          <label key={k} style={{ fontSize: 11, opacity: 0.85 }}>
            <div style={{ marginBottom: 3, fontWeight: 600 }}>{k}</div>
            <input style={input} value={profile[k] || ''} onChange={(e) => setField(k, e.target.value)} onBlur={save} />
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
const AnswerBankSection: React.FC<{ answers: AnswerBankEntry[]; reload: () => void }> = ({ answers, reload }) => {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [context, setContext] = useState('');

  const save = async () => {
    if (!label.trim() || !value.trim()) return;
    await api().upsertAnswer({ label: label.trim(), value: value.trim(), context: context.trim() || null, patterns: [] });
    setLabel(''); setValue(''); setContext(''); setAdding(false); reload();
  };

  return (
    <section style={card}>
      <SectionHead icon={<Brain size={16} />} title="Answer bank" count={answers.length}
        action={<button style={btn} onClick={() => setAdding((v) => !v)}><Plus size={14} /> Add</button>} />
      <p style={{ fontSize: 12, opacity: 0.6, marginTop: 0 }}>
        Your reusable answers. Context lets one concept have different values, e.g. display name vs legal name.
      </p>

      {adding && (
        <div style={{ display: 'grid', gap: 8, margin: '10px 0', padding: 12, border: '1px dashed var(--ink, rgba(0,0,0,.2))', borderRadius: 10 }}>
          <input style={input} placeholder='Label (e.g. "Legal name")' value={label} onChange={(e) => setLabel(e.target.value)} />
          <input style={input} placeholder='Value (e.g. "Arkah Mynn Nwe")' value={value} onChange={(e) => setValue(e.target.value)} />
          <input style={input} placeholder='When to use it (optional, e.g. "when it asks for legal/full name")' value={context} onChange={(e) => setContext(e.target.value)} />
          <div><button style={{ ...btn, fontWeight: 700 }} onClick={save}>Save</button></div>
        </div>
      )}

      {answers.length === 0 && <Empty>No saved answers yet. The extension will add them as you apply.</Empty>}
      {answers.map((a) => (
        <Row key={a.id} onDelete={async () => { await api().deleteAnswer(a.id); reload(); }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{a.label}</div>
          <div style={{ fontSize: 13 }}>{a.value}</div>
          {a.context && <div style={{ fontSize: 11, opacity: 0.6, fontStyle: 'italic' }}>{a.context}</div>}
        </Row>
      ))}
    </section>
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
