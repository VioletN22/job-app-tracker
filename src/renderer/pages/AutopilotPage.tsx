import React, { useState, useEffect } from 'react';
import { Plus, Trash2, FileText, Brain, MessageSquareHeart, Sparkles, Link2, PenLine, Lock, Wand2, Check, ThumbsUp, ThumbsDown } from 'lucide-react';
import { AnswerBankEntry, LockerDocument, VoiceNote, VoiceNoteKind, PortfolioLink, CoverLetter } from '../../shared/types';

const api = () => window.electronAPI.autopilot;

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

      <AnswerBankSection answers={answers} reload={reload} />
      <DocumentLockerSection docs={docs} reload={reload} />
      <PortfolioSection links={links} reload={reload} />
      <CoverLetterSection letters={letters} reload={reload} />
      <VoiceSection notes={notes} reload={reload} />
    </div>
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
