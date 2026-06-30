import { useEffect, useState, useCallback } from 'react';

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 14, marginBottom: 14 };
const sectionTitle: React.CSSProperties = { fontSize: 11.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', fontFamily: 'monospace', marginBottom: 10 };
const btn: React.CSSProperties = { border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' };

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [toast, setToast] = useState('');
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [schedPhone, setSchedPhone] = useState('');
  const [schedName, setSchedName] = useState('');
  const [schedTime, setSchedTime] = useState('08:00');
  const [schedTheme, setSchedTheme] = useState('');
  const [schedSaving, setSchedSaving] = useState(false);

  const load = useCallback(() => {
    fetch('/api/dashboard-data').then(r => r.json()).then(setData).catch(console.error);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 8000); // refresh every 8s for near-live feel
    return () => clearInterval(interval);
  }, [load]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const resolveDecision = async (id: string, outcome: 'approved' | 'declined') => {
    setSending(p => ({ ...p, [id]: true }));
    const r = await fetch('/api/resolve-decision', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decisionId: id, outcome, editedMessage: editing[id] }),
    });
    const json = await r.json();
    setSending(p => ({ ...p, [id]: false }));
    if (outcome === 'approved') showToast('✓ Moving forward — reply queued to send');
    else showToast('Declined — marked as not a fit');
    load();
  };

  const resolveMessage = async (id: string, action: 'approve' | 'decline') => {
    setSending(p => ({ ...p, [id]: true }));
    await fetch('/api/approve-message', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: id, action, editedText: editing[id] }),
    });
    setSending(p => ({ ...p, [id]: false }));
    if (action === 'approve') showToast('✓ Approved — IRIS will send this within ~15 min (or open the app to send now)');
    else showToast('Declined');
    load();
  };

  const addScheduledRule = async () => {
    if (!schedPhone.trim() || !schedTheme.trim()) {
      showToast('Enter a phone number and a theme first');
      return;
    }
    setSchedSaving(true);
    const r = await fetch('/api/scheduled-rules', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumber: schedPhone.trim(),
        contactName: schedName.trim() || null,
        sendTime: schedTime,
        theme: schedTheme.trim(),
      }),
    });
    setSchedSaving(false);
    if (r.ok) {
      showToast('✓ Scheduled message added');
      setSchedPhone(''); setSchedName(''); setSchedTheme('');
      load();
    } else {
      const json = await r.json().catch(() => ({}));
      showToast('Failed: ' + (json.error || 'unknown error'));
    }
  };

  const deleteScheduledRule = async (id: string) => {
    await fetch('/api/scheduled-rules', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    showToast('Removed');
    load();
  };

  if (!data) return (
    <div style={{ padding: 40, color: 'var(--muted)', fontFamily: 'monospace', fontSize: 13 }}>
      Loading IRIS…
    </div>
  );

  const totalPending = (data.decisions?.length || 0) + (data.queue?.length || 0);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 60px' }}>
      {toast && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', background: '#1a3a1a', border: '1px solid var(--success)', color: 'var(--success)', borderRadius: 10, padding: '10px 18px', fontSize: 13, zIndex: 999, fontWeight: 600 }}>
          {toast}
        </div>
      )}

      <h1 style={{ fontSize: 20, marginBottom: 4 }}>IRIS <span style={{ color: 'var(--accent)' }}>Dashboard</span></h1>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20, fontFamily: 'monospace' }}>
        {totalPending > 0 ? `${totalPending} item${totalPending > 1 ? 's' : ''} need your attention` : 'All clear — nothing waiting on you'}
      </div>

      {/* NEEDS YOUR DECISION */}
      <div style={card}>
        <div style={sectionTitle}>Needs Your Decision</div>
        {totalPending === 0 && (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>Nothing waiting on you right now.</div>
        )}

        {data.decisions?.map((d: any) => (
          <div key={d.id} style={{ border: '1px solid var(--accent)', background: 'var(--accent-dim)', borderRadius: 12, padding: 12, marginBottom: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
              {d.type === 'viewing'
                ? `📅 ${d.conversations?.contact_name || d.conversations?.contact_identifier} — picked: ${d.slot}`
                : `📋 ${d.conversations?.contact_name || d.conversations?.contact_identifier} — ready for your call`}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Edit the message below before sending (or leave as-is):</div>
            <textarea
              defaultValue={editing[d.id] ?? ''}
              placeholder="(leave blank to use the default message)"
              onChange={e => setEditing(prev => ({ ...prev, [d.id]: e.target.value }))}
              style={{ width: '100%', minHeight: 70, background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)', padding: 8, marginBottom: 8, fontFamily: 'inherit', fontSize: 13 }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                style={{ ...btn, background: sending[d.id] ? '#2a4a2a' : 'var(--success)', color: '#0E2615', flex: 1, opacity: sending[d.id] ? 0.7 : 1 }}
                onClick={() => resolveDecision(d.id, 'approved')}
                disabled={sending[d.id]}
              >
                {sending[d.id] ? 'Sending…' : (d.type === 'viewing' ? 'Confirm Time' : 'Move Forward')}
              </button>
              <button
                style={{ ...btn, background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)', flex: 1 }}
                onClick={() => resolveDecision(d.id, 'declined')}
                disabled={sending[d.id]}
              >
                {d.type === 'viewing' ? 'Suggest Different' : 'Not a Fit'}
              </button>
            </div>
          </div>
        ))}

        {data.queue?.map((m: any) => (
          <div key={m.id} style={{ border: '1px solid var(--line)', background: 'var(--surface-2)', borderRadius: 12, padding: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>
              {m.conversations?.contact_name || m.conversations?.contact_identifier}
              {m.conversations?.channel && <span> · {m.conversations.channel}</span>}
              {m.category && <span> · {m.category.replace('_', ' ')}</span>}
            </div>
            {m.incomingBody && (
              <div style={{ fontSize: 13, color: 'var(--muted)', background: 'var(--bg)', borderRadius: 8, padding: '6px 10px', marginBottom: 8 }}>
                <span style={{ fontSize: 11, display: 'block', marginBottom: 2, color: 'var(--muted)' }}>THEM</span>
                {m.incomingBody}
              </div>
            )}
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>IRIS DRAFT — edit before sending:</div>
            <textarea
              defaultValue={m.body}
              onChange={e => setEditing(prev => ({ ...prev, [m.id]: e.target.value }))}
              style={{ width: '100%', minHeight: 70, background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)', padding: 8, marginBottom: 8, fontFamily: 'inherit', fontSize: 13 }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                style={{ ...btn, background: sending[m.id] ? '#2a4a2a' : 'var(--success)', color: '#0E2615', flex: 1, opacity: sending[m.id] ? 0.7 : 1 }}
                onClick={() => resolveMessage(m.id, 'approve')}
                disabled={sending[m.id]}
              >
                {sending[m.id] ? 'Approving…' : 'Approve & Send'}
              </button>
              <button
                style={{ ...btn, background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)', flex: 1 }}
                onClick={() => resolveMessage(m.id, 'decline')}
                disabled={sending[m.id]}
              >
                Decline
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* QUALIFIED APPLICANTS */}
      <div style={card}>
        <div style={sectionTitle}>Qualified Applicants</div>
        {(!data.applicants || data.applicants.length === 0) && (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>None yet.</div>
        )}
        {data.applicants?.map((a: any) => (
          <div key={a.conversation_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
            <span>{a.conversations?.contact_name || a.conversations?.contact_identifier}</span>
            <span style={{ color: a.qualification_score >= 7 ? 'var(--success)' : 'var(--accent)', fontFamily: 'monospace', fontWeight: 700 }}>{a.qualification_score}/10</span>
          </div>
        ))}
      </div>

      {/* RECENT CONVERSATIONS */}
      <div style={card}>
        <div style={sectionTitle}>Recent Conversations</div>
        {(!data.conversations || data.conversations.length === 0) && (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>No conversations yet.</div>
        )}
        {data.conversations?.map((c: any) => {
          const msgs = c.messages || [];
          const last = msgs.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
          return (
            <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{c.contact_name || c.contact_identifier}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>
                  {c.channel}{c.trusted ? ' · known' : ' · unknown'}
                </span>
              </div>
              {last && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {last.direction === 'outgoing' ? '↗ ' : '↙ '}{last.body}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* SCHEDULED MESSAGES */}
      <div style={card}>
        <div style={sectionTitle}>Scheduled Messages</div>
        {(!data.scheduledRules || data.scheduledRules.length === 0) && (
          <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 10 }}>No scheduled messages set up yet.</div>
        )}
        {data.scheduledRules?.map((r: any) => (
          <div key={r.id} style={{ display: 'flex', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 12.5, alignItems: 'center' }}>
            <span style={{ fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 700 }}>{r.send_time}</span>
            <span style={{ color: 'var(--muted)' }}>→</span>
            <span>{r.conversations?.contact_name || r.conversations?.contact_identifier}</span>
            <span style={{ flex: 1, color: 'var(--muted)', fontSize: 11.5 }}>{r.theme}</span>
            <button
              style={{ background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)', borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}
              onClick={() => deleteScheduledRule(r.id)}
            >
              Remove
            </button>
          </div>
        ))}

        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 8 }}>
            Add a new one — this works over SMS only (WhatsApp can't send a fresh outbound message, only reply to one).
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
            <input
              type="tel" placeholder="Phone number (e.g. +15551234567)" value={schedPhone}
              onChange={e => setSchedPhone(e.target.value)}
              style={{ flex: '1 1 200px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)', padding: '8px 10px', fontSize: 13 }}
            />
            <input
              type="text" placeholder="Name (optional)" value={schedName}
              onChange={e => setSchedName(e.target.value)}
              style={{ flex: '1 1 140px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)', padding: '8px 10px', fontSize: 13 }}
            />
            <input
              type="time" value={schedTime}
              onChange={e => setSchedTime(e.target.value)}
              style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)', padding: '8px 10px', fontSize: 13 }}
            />
          </div>
          <input
            type="text" placeholder='Theme — e.g. "good morning message for my partner, affectionate but not cheesy"'
            value={schedTheme} onChange={e => setSchedTheme(e.target.value)}
            style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)', padding: '8px 10px', fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }}
          />
          <button
            style={{ ...btn, background: schedSaving ? '#5a3b2c' : 'var(--accent)', color: '#231509', width: '100%' }}
            onClick={addScheduledRule}
            disabled={schedSaving}
          >
            {schedSaving ? 'Adding…' : 'Add Scheduled Message'}
          </button>
        </div>
      </div>
    </div>
  );
}
