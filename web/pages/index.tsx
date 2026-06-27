import { useEffect, useState, useCallback } from 'react';

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 14, marginBottom: 14 };
const sectionTitle: React.CSSProperties = { fontSize: 11.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', fontFamily: 'monospace', marginBottom: 10 };
const btn: React.CSSProperties = { border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' };

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    fetch('/api/dashboard-data').then(r => r.json()).then(setData);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000); // simple polling refresh
    return () => clearInterval(interval);
  }, [load]);

  if (!data) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading…</div>;

  const resolveDecision = async (id: string, outcome: 'approved' | 'declined') => {
    await fetch('/api/resolve-decision', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decisionId: id, outcome, editedMessage: editing[id] }),
    });
    load();
  };

  const resolveMessage = async (id: string, action: 'approve' | 'decline') => {
    await fetch('/api/approve-message', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: id, action, editedText: editing[id] }),
    });
    load();
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 60px' }}>
      <h1 style={{ fontSize: 20 }}>IRIS <span style={{ color: 'var(--accent)' }}>Dashboard</span></h1>

      <div style={card}>
        <div style={sectionTitle}>Needs Your Decision</div>
        {(!data.decisions || data.decisions.length === 0) && (!data.queue || data.queue.length === 0) && (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>Nothing waiting on you right now.</div>
        )}

        {data.decisions?.map((d: any) => (
          <div key={d.id} style={{ border: '1px solid var(--accent)', background: 'var(--accent-dim)', borderRadius: 12, padding: 12, marginBottom: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              {d.type === 'viewing' ? `📅 ${d.conversations?.contact_name || d.conversations?.contact_identifier} picked: ${d.slot}` : `📋 ${d.conversations?.contact_name || d.conversations?.contact_identifier} — ready for your call`}
            </div>
            <textarea
              defaultValue={editing[d.id] ?? ''}
              placeholder="(leave blank to use the default message)"
              onChange={e => setEditing(prev => ({ ...prev, [d.id]: e.target.value }))}
              style={{ width: '100%', minHeight: 60, background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)', padding: 8, marginBottom: 8 }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={{ ...btn, background: 'var(--success)', color: '#0E2615', flex: 1 }} onClick={() => resolveDecision(d.id, 'approved')}>
                {d.type === 'viewing' ? 'Confirm Time' : 'Move Forward'}
              </button>
              <button style={{ ...btn, background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)', flex: 1 }} onClick={() => resolveDecision(d.id, 'declined')}>
                {d.type === 'viewing' ? 'Suggest Different' : 'Not a Fit'}
              </button>
            </div>
          </div>
        ))}

        {data.queue?.map((m: any) => (
          <div key={m.id} style={{ border: '1px solid var(--line)', background: 'var(--surface-2)', borderRadius: 12, padding: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 6 }}>{m.conversations?.contact_name || m.conversations?.contact_identifier} · {m.category}</div>
            <textarea
              defaultValue={m.body}
              onChange={e => setEditing(prev => ({ ...prev, [m.id]: e.target.value }))}
              style={{ width: '100%', minHeight: 60, background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)', padding: 8, marginBottom: 8 }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={{ ...btn, background: 'var(--success)', color: '#0E2615', flex: 1 }} onClick={() => resolveMessage(m.id, 'approve')}>Approve & Send</button>
              <button style={{ ...btn, background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)', flex: 1 }} onClick={() => resolveMessage(m.id, 'decline')}>Decline</button>
            </div>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={sectionTitle}>Qualified Applicants</div>
        {(!data.applicants || data.applicants.length === 0) && <div style={{ color: 'var(--muted)', fontSize: 13 }}>None yet.</div>}
        {data.applicants?.map((a: any) => (
          <div key={a.conversation_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
            <span>{a.conversations?.contact_name || a.conversations?.contact_identifier}</span>
            <span style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>{a.qualification_score}/10</span>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={sectionTitle}>Recent Conversations</div>
        {data.conversations?.map((c: any) => {
          const last = (c.messages || []).slice(-1)[0];
          return (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
              <span>{c.contact_name || c.contact_identifier} <span style={{ color: 'var(--muted)', fontSize: 11 }}>({c.channel}{c.trusted ? ' · known' : ''})</span></span>
              <span style={{ color: 'var(--muted)', fontSize: 12, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{last?.body || ''}</span>
            </div>
          );
        })}
      </div>

      <div style={card}>
        <div style={sectionTitle}>Scheduled Messages</div>
        {data.scheduledRules?.map((r: any) => (
          <div key={r.id} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: 12.5, alignItems: 'center' }}>
            <span style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{r.send_time}</span>
            <span>→ {r.conversations?.contact_name || r.conversations?.contact_identifier}</span>
            <span style={{ flex: 1, color: 'var(--muted)' }}>{r.theme}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
