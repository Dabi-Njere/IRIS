import { useEffect, useState, useCallback } from 'react';

const S = {
  page: { maxWidth: 700, margin: '0 auto', padding: '20px 16px 80px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#1C1B22', minHeight: '100vh', color: '#F5F3F0' } as React.CSSProperties,
  card: { background: '#25232C', border: '1px solid #3A3744', borderRadius: 14, padding: 16, marginBottom: 14 } as React.CSSProperties,
  title: { fontSize: 11, color: '#9A97A6', textTransform: 'uppercase' as const, letterSpacing: '.08em', fontFamily: 'monospace', marginBottom: 10 },
  btn: (color: string, text = '#F5F3F0') => ({ border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', background: color, color: text } as React.CSSProperties),
  input: { background: '#2D2B36', border: '1px solid #3A3744', borderRadius: 8, color: '#F5F3F0', padding: '9px 11px', fontSize: 13, width: '100%', boxSizing: 'border-box' as const },
  muted: { color: '#9A97A6', fontSize: 13 } as React.CSSProperties,
};

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState('');
  const [profile, setProfile] = useState<any>(null);
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileForm, setProfileForm] = useState<any>({});
  const [schedPhone, setSchedPhone] = useState('');
  const [schedName, setSchedName] = useState('');
  const [schedTime, setSchedTime] = useState('08:00');
  const [schedTheme, setSchedTheme] = useState('');
  const [schedBusy, setSchedBusy] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const load = useCallback(async () => {
    try {
      const [dashRes, profileRes] = await Promise.all([
        fetch('/api/dashboard-data'),
        fetch('/api/owner-profile'),
      ]);
      if (!dashRes.ok) {
        const txt = await dashRes.text();
        setError(`API error ${dashRes.status}: ${txt.slice(0, 200)}`);
        return;
      }
      setData(await dashRes.json());
      setError('');
      if (profileRes.ok) {
        const p = await profileRes.json();
        setProfile(p);
        setProfileForm(p);
      }
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

  const saveProfile = async () => {
    setProfileSaving(true);
    try {
      const r = await fetch('/api/owner-profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileForm),
      });
      if (r.ok) {
        showToast('✓ Profile saved — IRIS will use this going forward');
        setProfileEditing(false);
        setProfile(await r.json());
      } else showToast('Failed to save profile');
    } finally { setProfileSaving(false); }
  };

  const addSchedule = async () => {
    if (!schedPhone.trim() || !schedTheme.trim()) { showToast('Enter a phone number and theme first'); return; }
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>IRIS <span style={{ color: '#FF8A5B' }}>Dashboard</span></h1>
        <button style={S.btn('#3A3744')} onClick={load}>Refresh</button>
      </div>

      {toast && <div style={{ background: '#2D2B36', border: '1px solid #6FCF97', borderRadius: 10, padding: '10px 14px', marginBottom: 14, color: '#6FCF97', fontSize: 13 }}>{toast}</div>}
      {error && <div style={{ background: '#3A2A2A', border: '1px solid #E2685A', borderRadius: 10, padding: '10px 14px', marginBottom: 14, color: '#E2685A', fontSize: 13 }}>{error}</div>}
      {!data && !error && <div style={{ ...S.muted, padding: 40, textAlign: 'center' }}>Loading…</div>}

      {data && <>
        {/* DECISIONS + QUEUE */}
        <div style={S.card}>
          <div style={S.title}>Needs Your Decision</div>
          {(!data.decisions?.length && !data.queue?.length) && (
            <div style={S.muted}>Nothing waiting on you — IRIS is handling things.</div>
          )}

          {data.decisions?.map((d: any) => (
            <div key={d.id} style={{ border: '1px solid #FF8A5B', background: '#5A3B2C', borderRadius: 12, padding: 12, marginBottom: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14 }}>
                {d.type === 'viewing'
                  ? `📅 ${d.conversations?.contact_name || d.conversations?.contact_identifier} picked: ${d.slot}`
                  : `📋 ${d.conversations?.contact_name || d.conversations?.contact_identifier} — ready for your call`}
              </div>
              <textarea
                defaultValue={editing[d.id] ?? ''}
                placeholder="Edit the reply before sending (optional)"
                onChange={e => setEditing(p => ({ ...p, [d.id]: e.target.value }))}
                style={{ ...S.input, minHeight: 70, marginBottom: 8, resize: 'vertical' }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={{ ...S.btn('#6FCF97', '#0E2615'), flex: 1 }} disabled={busy[d.id]} onClick={() => resolveDecision(d.id, 'approved')}>
                  {busy[d.id] ? '…' : d.type === 'viewing' ? 'Confirm Time' : 'Move Forward'}
                </button>
                <button style={{ ...S.btn('transparent'), border: '1px solid #E2685A', color: '#E2685A', flex: 1 }} disabled={busy[d.id]} onClick={() => resolveDecision(d.id, 'declined')}>
                  {busy[d.id] ? '…' : d.type === 'viewing' ? 'Suggest Different' : 'Not a Fit'}
                </button>
              </div>
            </div>
          ))}

          {data.queue?.map((m: any) => (
            <div key={m.id} style={{ border: '1px solid #3A3744', background: '#2D2B36', borderRadius: 12, padding: 12, marginBottom: 10 }}>
              <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#9A97A6', marginBottom: 6 }}>
                {m.conversations?.contact_name || m.conversations?.contact_identifier} · {m.category}
              </div>
              <textarea
                defaultValue={editing[m.id] ?? m.body}
                onChange={e => setEditing(p => ({ ...p, [m.id]: e.target.value }))}
                style={{ ...S.input, minHeight: 60, marginBottom: 8, resize: 'vertical' }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={{ ...S.btn('#6FCF97', '#0E2615'), flex: 1 }} disabled={busy[m.id]} onClick={() => resolveMessage(m.id, 'approve')}>
                  {busy[m.id] ? '…' : 'Approve & Send'}
                </button>
                <button style={{ ...S.btn('transparent'), border: '1px solid #E2685A', color: '#E2685A', flex: 1 }} disabled={busy[m.id]} onClick={() => resolveMessage(m.id, 'decline')}>
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
                <span style={{ fontFamily: 'monospace', color: '#FF8A5B' }}>{a.qualification_score}/10</span>
              </div>
            ))}
          </div>
        )}

        {/* RECENT CONVERSATIONS */}
        <div style={S.card}>
          <div style={S.title}>Recent Conversations</div>
          {!data.conversations?.length && <div style={S.muted}>No conversations yet.</div>}
          {data.conversations?.map((c: any) => {
            const msgs = (c.messages || []).sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            const last = msgs[msgs.length - 1];
            return (
              <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid #3A3744' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{c.contact_name || c.contact_identifier}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#9A97A6' }}>{c.channel}{c.trusted ? ' · saved' : ' · unknown'}</span>
                </div>
                {last && <div style={{ color: '#9A97A6', fontSize: 12.5 }}>{last.direction === 'outgoing' ? 'IRIS: ' : 'Them: '}{(last.body || '').slice(0, 100)}{(last.body || '').length > 100 ? '…' : ''}</div>}
              </div>
            );
          })}
        </div>

        {/* OWNER PROFILE */}
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={S.title}>My Profile</div>
            <button style={S.btn('#3A3744')} onClick={() => { setProfileEditing(!profileEditing); setProfileForm(profile || {}); }}>
              {profileEditing ? 'Cancel' : 'Edit'}
            </button>
          </div>
          <div style={{ color: '#9A97A6', fontSize: 12, marginBottom: 10 }}>
            IRIS uses this to answer questions about you accurately — where you live, what you do, etc.
          </div>

          {!profileEditing ? (
            profile?.name ? (
              <div>
                {([['Name', profile.name], ['Age', profile.age], ['Occupation', profile.occupation], ['Employer', profile.employer], ['Location', profile.location], ['Physical', profile.physical_description], ['Other context', profile.other_context]] as [string, any][]).map(([k, v]) => v ? (
                  <div key={k} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid #3A3744', fontSize: 13 }}>
                    <span style={{ color: '#9A97A6', minWidth: 90 }}>{k}</span><span>{v}</span>
                  </div>
                ) : null)}
              </div>
            ) : <div style={S.muted}>No profile yet — click Edit to add your details.</div>
          ) : (
            <div>
              {([['name', 'Your name'], ['age', 'Age'], ['occupation', 'Occupation'], ['employer', 'Employer'], ['location', 'Location'], ['physical_description', 'Physical description (optional)'], ['other_context', 'Nigerian/Pidgin slang, anything else IRIS should know']] as [string, string][]).map(([key, placeholder]) => (
                <input key={key} type="text" placeholder={placeholder}
                  value={profileForm[key] || ''}
                  onChange={e => setProfileForm((p: any) => ({ ...p, [key]: e.target.value }))}
                  style={{ ...S.input, marginBottom: 8 }}
                />
              ))}
              <button style={{ ...S.btn('#FF8A5B', '#231509'), width: '100%' }} disabled={profileSaving} onClick={saveProfile}>
                {profileSaving ? 'Saving…' : 'Save Profile'}
              </button>
            </div>
          )}
        </div>

        {/* SCHEDULED MESSAGES */}
        <div style={S.card}>
          <div style={S.title}>Scheduled Messages</div>
          {!data.scheduledRules?.length && <div style={{ ...S.muted, marginBottom: 12 }}>No scheduled messages yet.</div>}
          {data.scheduledRules?.map((r: any) => (
            <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #3A3744', flexWrap: 'wrap' as const }}>
              <span style={{ fontFamily: 'monospace', color: '#FF8A5B', fontWeight: 700 }}>{r.send_time}</span>
              <span style={{ color: '#9A97A6' }}>→</span>
              <span style={{ fontSize: 13 }}>{r.conversations?.contact_name || r.conversations?.contact_identifier}</span>
              <span style={{ flex: 1, color: '#9A97A6', fontSize: 12 }}>{r.theme}</span>
              <button style={{ background: 'transparent', border: '1px solid #E2685A', color: '#E2685A', borderRadius: 6, padding: '3px 9px', fontSize: 12, cursor: 'pointer' }} onClick={() => deleteSchedule(r.id)}>Remove</button>
            </div>
          ))}
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #3A3744' }}>
            <div style={{ color: '#9A97A6', fontSize: 12, marginBottom: 10 }}>Add a scheduled message — SMS only</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' as const }}>
              <input type="tel" placeholder="+14162712651" value={schedPhone} onChange={e => setSchedPhone(e.target.value)}
                style={{ ...S.input, flex: '1 1 180px' }} />
              <input type="text" placeholder="Name (optional)" value={schedName} onChange={e => setSchedName(e.target.value)}
                style={{ ...S.input, flex: '1 1 130px' }} />
              <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)}
                style={{ ...S.input, flex: '0 0 auto' }} />
            </div>
            <input type="text" placeholder='Theme — e.g. "warm good morning message for my partner"'
              value={schedTheme} onChange={e => setSchedTheme(e.target.value)}
              style={{ ...S.input, marginBottom: 10 }} />
            <button style={{ ...S.btn('#FF8A5B', '#231509'), width: '100%' }} disabled={schedBusy} onClick={addSchedule}>
              {schedBusy ? 'Adding…' : '+ Add Scheduled Message'}
            </button>
          </div>
        </div>
      </>}
    </div>
  );
}
