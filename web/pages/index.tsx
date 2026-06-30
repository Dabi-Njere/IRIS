import { useEffect, useState, useCallback } from 'react';

const S = {
  page: { maxWidth: 700, margin: '0 auto', padding: '20px 16px 80px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#1C1B22', minHeight: '100vh', color: '#F5F3F0' } as React.CSSProperties,
  card: { background: '#25232C', border: '1px solid #3A3744', borderRadius: 14, padding: 16, marginBottom: 14 } as React.CSSProperties,
  title: { fontSize: 11, color: '#9A97A6', textTransform: 'uppercase' as const, letterSpacing: '.08em', fontFamily: 'monospace', marginBottom: 10 },
  btn: (color: string) => ({ border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', background: color, color: color === '#6FCF97' ? '#0E2615' : color === '#FF8A5B' ? '#231509' : '#F5F3F0' } as React.CSSProperties),
  input: { background: '#2D2B36', border: '1px solid #3A3744', borderRadius: 8, color: '#F5F3F0', padding: '9px 11px', fontSize: 13, width: '100%', boxSizing: 'border-box' as const },
  tag: { fontFamily: 'monospace', fontSize: 11, color: '#9A97A6' },
  muted: { color: '#9A97A6', fontSize: 13 },
  accent: { color: '#FF8A5B' },
  success: { color: '#6FCF97' },
  danger: { color: '#E2685A' },
  row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const },
};

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState('');
  const [schedPhone, setSchedPhone] = useState('');
  const [schedName, setSchedName] = useState('');
  const [schedTime, setSchedTime] = useState('08:00');
  const [schedTheme, setSchedTheme] = useState('');
  const [schedBusy, setSchedBusy] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/dashboard-data');
      if (!r.ok) {
        const txt = await r.text();
        setError(`API error ${r.status}: ${txt.slice(0, 200)}`);
        return;
      }
      const json = await r.json();
      setData(json);
      setError('');
    } catch (e: any) {
      setError('Failed to load: ' + e.message);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, [load]);

  const resolveDecision = async (id: string, outcome: 'approved' | 'declined') => {
    setBusy(b => ({ ...b, [id]: true }));
    try {
      const r = await fetch('/api/resolve-decision', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisionId: id, outcome, editedMessage: editing[id] || undefined }),
      });
      if (r.ok) { showToast(outcome === 'approved' ? '✓ Moving forward' : '✓ Declined'); load(); }
      else showToast('Error — try again');
    } finally { setBusy(b => ({ ...b, [id]: false })); }
  };

  const resolveMessage = async (id: string, action: 'approve' | 'decline') => {
    setBusy(b => ({ ...b, [id]: true }));
    try {
      const r = await fetch('/api/approve-message', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: id, action, editedText: editing[id] || undefined }),
      });
      if (r.ok) { showToast(action === 'approve' ? '✓ Sent' : '✓ Declined'); load(); }
      else showToast('Error — try again');
    } finally { setBusy(b => ({ ...b, [id]: false })); }
  };

  const addSchedule = async () => {
    if (!schedPhone.trim() || !schedTheme.trim()) { showToast('Need a phone number and theme'); return; }
    setSchedBusy(true);
    try {
      const r = await fetch('/api/scheduled-rules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: schedPhone.trim(), contactName: schedName.trim() || null, sendTime: schedTime, theme: schedTheme.trim() }),
      });
      if (r.ok) {
        showToast('✓ Scheduled message added');
        setSchedPhone(''); setSchedName(''); setSchedTheme('');
        load();
      } else {
        const j = await r.json().catch(() => ({}));
        showToast('Failed: ' + (j.error || 'unknown'));
      }
    } finally { setSchedBusy(false); }
  };

  const deleteSchedule = async (id: string) => {
    await fetch('/api/scheduled-rules', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    showToast('Removed'); load();
  };

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>IRIS <span style={S.accent}>Dashboard</span></h1>
        <button style={S.btn('#3A3744')} onClick={load}>Refresh</button>
      </div>

      {/* Toast */}
      {toast && <div style={{ background: '#2D2B36', border: '1px solid #6FCF97', borderRadius: 10, padding: '10px 14px', marginBottom: 14, color: '#6FCF97', fontSize: 13 }}>{toast}</div>}

      {/* Error */}
      {error && <div style={{ background: '#3A2A2A', border: '1px solid #E2685A', borderRadius: 10, padding: '10px 14px', marginBottom: 14, color: '#E2685A', fontSize: 13 }}>{error}</div>}

      {/* Loading */}
      {!data && !error && <div style={{ ...S.muted, padding: 40, textAlign: 'center' }}>Loading…</div>}

      {data && <>
        {/* DECISIONS */}
        <div style={S.card}>
          <div style={S.title}>Needs Your Decision</div>
          {(!data.decisions?.length && !data.queue?.length) && <div style={S.muted}>Nothing waiting on you right now — IRIS is handling things.</div>}

          {data.decisions?.map((d: any) => (
            <div key={d.id} style={{ border: '1px solid #FF8A5B', background: '#5A3B2C', borderRadius: 12, padding: 12, marginBottom: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14 }}>
                {d.type === 'viewing' ? `📅 ${d.conversations?.contact_name || d.conversations?.contact_identifier} picked: ${d.slot}` : `📋 ${d.conversations?.contact_name || d.conversations?.contact_identifier} — applicant summary`}
              </div>
              <textarea
                defaultValue={editing[d.id] ?? ''}
                placeholder="Edit the reply before sending (optional)"
                onChange={e => setEditing(prev => ({ ...prev, [d.id]: e.target.value }))}
                style={{ ...S.input, minHeight: 70, marginBottom: 8, resize: 'vertical' }}
              />
              <div style={S.row}>
                <button style={{ ...S.btn('#6FCF97'), flex: 1 }} disabled={busy[d.id]} onClick={() => resolveDecision(d.id, 'approved')}>
                  {busy[d.id] ? '…' : d.type === 'viewing' ? 'Confirm Time' : 'Move Forward'}
                </button>
                <button style={{ ...S.btn('#E2685A'), flex: 1 }} disabled={busy[d.id]} onClick={() => resolveDecision(d.id, 'declined')}>
                  {busy[d.id] ? '…' : d.type === 'viewing' ? 'Suggest Different' : 'Not a Fit'}
                </button>
              </div>
            </div>
          ))}

          {data.queue?.map((m: any) => (
            <div key={m.id} style={{ border: '1px solid #3A3744', background: '#2D2B36', borderRadius: 12, padding: 12, marginBottom: 10 }}>
              <div style={{ ...S.tag, marginBottom: 6 }}>{m.conversations?.contact_name || m.conversations?.contact_identifier} · {m.category}</div>
              <textarea
                defaultValue={editing[m.id] ?? m.body}
                onChange={e => setEditing(prev => ({ ...prev, [m.id]: e.target.value }))}
                style={{ ...S.input, minHeight: 60, marginBottom: 8, resize: 'vertical' }}
              />
              <div style={S.row}>
                <button style={{ ...S.btn('#6FCF97'), flex: 1 }} disabled={busy[m.id]} onClick={() => resolveMessage(m.id, 'approve')}>
                  {busy[m.id] ? '…' : 'Approve & Send'}
                </button>
                <button style={{ ...S.btn('#E2685A'), flex: 1 }} disabled={busy[m.id]} onClick={() => resolveMessage(m.id, 'decline')}>
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* APPLICANTS */}
        {data.applicants?.length > 0 && (
          <div style={S.card}>
            <div style={S.title}>Qualified Applicants</div>
            {data.applicants.map((a: any) => (
              <div key={a.conversation_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #3A3744', fontSize: 13 }}>
                <span>{a.conversations?.contact_name || a.conversations?.contact_identifier}</span>
                <span style={{ fontFamily: 'monospace', ...S.accent }}>{a.qualification_score}/10</span>
              </div>
            ))}
          </div>
        )}

        {/* RECENT CONVERSATIONS */}
        <div style={S.card}>
          <div style={S.title}>Recent Conversations</div>
          {(!data.conversations?.length) && <div style={S.muted}>No conversations yet.</div>}
          {data.conversations?.map((c: any) => {
            const msgs = (c.messages || []).sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            const last = msgs[msgs.length - 1];
            return (
              <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid #3A3744' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{c.contact_name || c.contact_identifier}</span>
                  <span style={{ ...S.tag, fontSize: 10 }}>{c.channel}{c.trusted ? ' · saved' : ' · unknown'}</span>
                </div>
                {last && <div style={{ ...S.muted, fontSize: 12.5 }}>{last.direction === 'outgoing' ? 'IRIS: ' : 'Them: '}{last.body?.slice(0, 100)}{(last.body?.length || 0) > 100 ? '…' : ''}</div>}
              </div>
            );
          })}
        </div>

        {/* SCHEDULED MESSAGES */}
        <div style={S.card}>
          <div style={S.title}>Scheduled Messages</div>
          {(!data.scheduledRules?.length) && <div style={{ ...S.muted, marginBottom: 12 }}>No scheduled messages yet — add one below.</div>}
          {data.scheduledRules?.map((r: any) => (
            <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #3A3744', flexWrap: 'wrap' as const }}>
              <span style={{ fontFamily: 'monospace', ...S.accent, fontWeight: 700 }}>{r.send_time}</span>
              <span style={S.muted}>→</span>
              <span style={{ fontSize: 13 }}>{r.conversations?.contact_name || r.conversations?.contact_identifier}</span>
              <span style={{ flex: 1, ...S.muted, fontSize: 12 }}>{r.theme}</span>
              <button style={{ background: 'transparent', border: '1px solid #E2685A', color: '#E2685A', borderRadius: 6, padding: '3px 9px', fontSize: 12, cursor: 'pointer' }} onClick={() => deleteSchedule(r.id)}>Remove</button>
            </div>
          ))}

          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #3A3744' }}>
            <div style={{ ...S.muted, fontSize: 12, marginBottom: 10 }}>Add a scheduled message — SMS only (WhatsApp can only reply, not initiate)</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' as const }}>
              <input type="tel" placeholder="+15551234567 (phone number)" value={schedPhone} onChange={e => setSchedPhone(e.target.value)}
                style={{ ...S.input, flex: '1 1 180px' }} />
              <input type="text" placeholder="Name (optional)" value={schedName} onChange={e => setSchedName(e.target.value)}
                style={{ ...S.input, flex: '1 1 130px' }} />
              <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)}
                style={{ ...S.input, flex: '0 0 auto' }} />
            </div>
            <input type="text" placeholder='Theme — e.g. "warm good morning message for my partner"'
              value={schedTheme} onChange={e => setSchedTheme(e.target.value)}
              style={{ ...S.input, marginBottom: 10 }} />
            <button style={{ ...S.btn('#FF8A5B'), width: '100%' }} disabled={schedBusy} onClick={addSchedule}>
              {schedBusy ? 'Adding…' : '+ Add Scheduled Message'}
            </button>
          </div>
        </div>
      </>}
    </div>
  );
}
