import React, { useMemo, useState } from 'react';
import { Phone, ShieldCheck, Lock, KeyRound, Check, AlertCircle, UserCircle, Pencil } from 'lucide-react';
import { dataService } from '../services/dataService';
import PinDigitInput from '../components/PinDigitInput';

export default function AccountPage({ user, setActivePage }) {
  // The devotee record that belongs to this account (matched by devoteeId, else mobile).
  const myDevotee = useMemo(() => {
    const list = dataService.getDevotees();
    if (user?.devoteeId) return list.find(d => d.id === user.devoteeId) || null;
    return list.find(d => String(d.mobile) === String(user?.mobile)) || null;
  }, [user]);

  const openMyProfile = () => {
    if (myDevotee) setActivePage?.('devotees', { openDevoteeId: myDevotee.id });
  };

  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);   // { type: 'ok'|'err', text }

  const initials = (user?.name || 'D').split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase();

  const savePassword = async (e) => {
    e.preventDefault();
    setMsg(null);
    if (pw.length < 4) return setMsg({ type: 'err', text: 'Password must be at least 4 characters.' });
    if (pw !== pw2) return setMsg({ type: 'err', text: 'Passwords do not match.' });
    setBusy(true);
    try {
      await dataService.changeMyCredentials({ password: pw });
      setPw(''); setPw2('');
      setMsg({ type: 'ok', text: 'Password updated. Use it next time you sign in.' });
    } catch (err) {
      setMsg({ type: 'err', text: err.message || 'Could not update password.' });
    } finally { setBusy(false); }
  };

  const savePin = async (e) => {
    e.preventDefault();
    setMsg(null);
    if (pin.length !== 6) return setMsg({ type: 'err', text: 'PIN must be exactly 6 digits.' });
    if (pin !== pin2) return setMsg({ type: 'err', text: 'PINs do not match.' });
    setBusy(true);
    try {
      await dataService.changeMyCredentials({ pin });
      setPin(''); setPin2('');
      setMsg({ type: 'ok', text: 'PIN updated.' });
    } catch (err) {
      setMsg({ type: 'err', text: err.message || 'Could not update PIN.' });
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-text-main tracking-tight">My Account</h1>
        <p className="text-sm font-semibold text-text-muted mt-1">Your profile and sign-in settings.</p>
      </div>

      {/* Profile card */}
      <div className="rounded-3xl border border-border-light bg-surface p-6 shadow-xs flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary text-white text-xl font-black">{initials}</div>
        <div className="min-w-0">
          <p className="text-lg font-bold text-text-main truncate">{user?.name || 'Devotee'}</p>
          <p className="text-sm text-text-muted flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> +91 {user?.mobile || '—'}</p>
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
            <ShieldCheck className="h-3 w-3" /> {user?.role || 'Devotee'}
          </span>
        </div>
      </div>

      {/* My devotee profile */}
      <div className="rounded-3xl border border-border-light bg-surface p-6 shadow-xs space-y-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-text-main"><UserCircle className="h-4 w-4 text-primary" /> My Profile</h2>
        {myDevotee ? (
          <>
            <p className="text-sm text-text-muted">Your devotee record — view your full details and edit your profile.</p>
            <button onClick={openMyProfile}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-[#00223f]">
              <Pencil className="h-4 w-4" /> View / Edit My Profile
            </button>
          </>
        ) : (
          <p className="text-sm text-text-muted">
            No devotee record is linked to your mobile number. Ask an admin to add you to the directory with this mobile ({user?.mobile || '—'}) to enable your profile.
          </p>
        )}
      </div>

      {msg && (
        <div className={`flex items-center gap-2.5 rounded-2xl border p-3 text-sm font-semibold ${msg.type === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-600'}`}>
          {msg.type === 'ok' ? <Check className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          {msg.text}
        </div>
      )}

      {/* Change password */}
      <form onSubmit={savePassword} className="rounded-3xl border border-border-light bg-surface p-6 shadow-xs space-y-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-text-main"><Lock className="h-4 w-4 text-primary" /> Change Password</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="New password"
            className="rounded-2xl border border-border-light bg-bg-base px-4 py-2.5 text-sm font-semibold text-text-main outline-none focus:border-primary" />
          <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} placeholder="Confirm new password"
            className="rounded-2xl border border-border-light bg-bg-base px-4 py-2.5 text-sm font-semibold text-text-main outline-none focus:border-primary" />
        </div>
        <button type="submit" disabled={busy}
          className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-[#00223f] disabled:opacity-50">
          {busy ? 'Saving…' : 'Update Password'}
        </button>
      </form>

      {/* Change PIN */}
      <form onSubmit={savePin} className="rounded-3xl border border-border-light bg-surface p-6 shadow-xs space-y-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-text-main"><KeyRound className="h-4 w-4 text-primary" /> Change 6-Digit PIN</h2>
        <div className="space-y-3">
          <div>
            <span className="text-xs font-bold text-text-muted mb-1.5 block">New PIN</span>
            <PinDigitInput length={6} value={pin} onChange={setPin} masked />
          </div>
          <div>
            <span className="text-xs font-bold text-text-muted mb-1.5 block">Confirm PIN</span>
            <PinDigitInput length={6} value={pin2} onChange={setPin2} masked />
          </div>
        </div>
        <button type="submit" disabled={busy}
          className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-[#00223f] disabled:opacity-50">
          {busy ? 'Saving…' : 'Update PIN'}
        </button>
      </form>
    </div>
  );
}
