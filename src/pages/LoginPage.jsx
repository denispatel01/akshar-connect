import React, { useState } from 'react';
import { Phone, Sparkles, AlertCircle, HelpCircle } from 'lucide-react';
import PinDigitInput from '../components/PinDigitInput';
import { dataService } from '../services/dataService';

export default function LoginPage({ onLoginSuccess }) {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  const [mobile, setMobile] = useState('');
  const [pin, setPin] = useState('');

  const isMobileValid = mobile.length === 10;
  const isPinValid = pin.length === 6;

  const handleMobileChange = (e) => {
    // Strip everything non-numeric and keep the last 10 digits, so pasting
    // "+91 83472 29948" auto-cleans to "8347229948" (drops country code/spaces).
    let digits = e.target.value.replace(/\D/g, '');
    if (digits.length > 10) digits = digits.slice(-10);
    setMobile(digits);
    setErrorMessage('');
  };

  // One login for everyone: Mobile + 6-digit PIN. Staff use their set PIN;
  // devotees use their date of birth as DDMMYY (e.g. 01-12-95 → 011295).
  const submitLogin = async (pinValue = pin) => {
    setErrorMessage('');
    if (!isMobileValid) return setErrorMessage('Enter a valid 10-digit mobile number');
    if (pinValue.length !== 6) return setErrorMessage('Enter your 6-digit PIN');
    if (loading) return;
    setLoading(true);
    try {
      const res = await dataService.login(mobile, pinValue);
      onLoginSuccess(res.user);
    } catch (err) {
      setErrorMessage('Invalid mobile number or PIN.');
    } finally {
      setLoading(false);
    }
  };
  const handleLoginSubmit = (e) => { e.preventDefault(); submitLogin(); };

  return (
    <div className="flex min-h-[100dvh] flex-col overflow-y-auto bg-bg-base">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left Side Hero Banner - Desktop */}
        <div className="relative hidden overflow-hidden lg:block lg:w-[48%] xl:w-1/2 bg-[#001F3D]">
          <img
            src={`${import.meta.env.BASE_URL}images/swamiji-pray.jpg`}
            alt="Swamiji offering prayers"
            className="absolute inset-0 z-0 h-full w-full object-cover object-center"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#001F3D] via-[#001F3D]/75 to-[#001F3D]/25 z-10" />
          <div
            className="absolute inset-0 z-10 opacity-70"
            style={{
              background: 'radial-gradient(ellipse 80% 80% at 20% 90%, rgba(200,100,43,0.35) 0%, transparent 70%)'
            }}
          />
          <div className="absolute inset-x-0 bottom-0 z-20 p-10 xl:p-14">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-surface/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-white backdrop-blur-md">
              <Sparkles className="h-4 w-4 text-[#FF862A]" />
              Akshar Connect
            </span>
            <h2 className="font-display text-4xl font-extrabold leading-tight text-white xl:text-5xl">
              Jai Swaminarayan
            </h2>
            <p className="mt-3 max-w-md text-base leading-relaxed text-white/80">
              Sign in to manage your Mandal — attendance, events, seva, and devotee records in one central platform.
            </p>

            <div className="mt-8 text-xs font-semibold text-white/50">
              Use the mobile number &amp; PIN provided by your Mandal admin.
            </div>
          </div>
        </div>

        {/* Right Side Login Form Container */}
        <div className="relative flex h-full flex-1 flex-col overflow-y-auto bg-surface">
          {/* Header Branding */}
          <div className="relative flex flex-shrink-0 flex-col items-center justify-center gap-2 px-4 pb-2 pt-6 sm:pt-8">
            <img
              src={`${import.meta.env.BASE_URL}images/logo.webp`}
              alt="Akshar Connect — Connecting Devotees with Divinity"
              className="h-16 w-auto max-w-[240px] object-contain sm:h-20"
            />
            <span className="text-[11px] font-bold uppercase tracking-widest text-text-muted block text-center">
              Adajan Satsang Mandal
            </span>
          </div>

          {/* Mobile / tablet devotional banner (desktop uses the side hero instead) */}
          <div className="relative mx-4 mt-2 flex-shrink-0 overflow-hidden rounded-3xl shadow-sm ring-1 ring-black/5 lg:hidden">
            <img
              src={`${import.meta.env.BASE_URL}images/quote-rajipo.webp`}
              alt="Kariye aej kam jema Taro Rajipo"
              className="h-36 w-full object-cover object-center sm:h-44"
              loading="lazy"
            />
          </div>

          <div className="relative mx-auto flex w-full max-w-[480px] flex-1 flex-col justify-center px-6 py-6 sm:px-10">
            <div className="mb-5 text-center">
              <h2 className="text-2xl font-bold text-text-main">Welcome Back</h2>
              <p className="text-sm font-medium text-text-muted mt-1">Jai Swaminarayan 🙏</p>
            </div>

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              {/* Mobile */}
              <div className="rounded-2xl border border-border-light bg-surface px-4 py-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-[#003158]/10 transition-all">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1">Mobile Number</label>
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5 text-text-muted" />
                  <span className="text-sm font-bold text-text-main">+91</span>
                  <input type="text" inputMode="numeric" value={mobile} onChange={handleMobileChange}
                    placeholder="10-digit mobile number"
                    className="w-full bg-transparent text-sm font-semibold text-text-main outline-none placeholder:text-slate-300" />
                </div>
              </div>

              {/* PIN */}
              <div>
                <span className="text-xs font-bold text-text-muted mb-2 block px-1">6-Digit PIN</span>
                <PinDigitInput length={6} value={pin} onChange={(val) => { setPin(val); setErrorMessage(''); }} onComplete={(val) => submitLogin(val)} masked={true} />
                <p className="mt-2 px-1 text-[11px] text-text-muted">Devotees: your PIN is your date of birth as <span className="font-bold">DDMMYY</span> — e.g. 01-12-95 → <span className="font-bold">011295</span>.</p>
              </div>

              {errorMessage && (
                <div className="flex items-center gap-2.5 rounded-2xl border border-red-100 bg-red-50 p-3 text-red-600">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" /><p className="text-xs font-semibold">{errorMessage}</p>
                </div>
              )}

              <button type="submit" disabled={loading || !isPinValid}
                className="w-full rounded-2xl bg-primary py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:bg-[#00223f] active:scale-[0.99] disabled:opacity-50">
                {loading ? 'Authenticating...' : 'Sign In →'}
              </button>

              {/* Help: forgot PIN / first time — the Mandal admin manages accounts,
                  so there is no self-service reset (no demo OTP). */}
              <button type="button" onClick={() => setShowHelp((v) => !v)}
                className="w-full flex items-center justify-center gap-1.5 text-center text-xs font-bold text-[#FF862A] hover:underline pt-1">
                <HelpCircle className="h-3.5 w-3.5" /> Forgot PIN / Trouble signing in?
              </button>
              {showHelp && (
                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3.5 text-[12px] leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  <p className="font-bold mb-1">How to sign in</p>
                  <ul className="list-disc space-y-1 pl-4">
                    <li><b>Devotees:</b> PIN is your <b>date of birth</b> as DDMMYY (e.g. 01-12-95 → <b>011295</b>). If it doesn't work, ask your Mandal admin to check the date of birth on your record.</li>
                    <li><b>Karyakarta / staff:</b> your mobile &amp; PIN are set by the Mandal admin. For a forgotten or new PIN, please contact the admin — they can view or reset it from <b>Admin → User Management</b>.</li>
                  </ul>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
