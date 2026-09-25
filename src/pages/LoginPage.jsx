import React, { useState } from 'react';
import { Lock, Eye, EyeOff, MessageCircle, Phone, KeyRound, Sparkles, CheckCircle, AlertCircle, User, Calendar } from 'lucide-react';
import PinDigitInput from '../components/PinDigitInput';
import { dataService } from '../services/dataService';

const MODE = {
  MAIN: 'main',
  OTP: 'otp',
  SETUP: 'setup'
};

// loginTab: 'staff' (Admin/Sevak — PIN or password) | 'devotee' (DOB login)
export default function LoginPage({ onLoginSuccess }) {
  const [mode, setMode] = useState(MODE.MAIN);
  const [loginTab, setLoginTab] = useState('staff'); // 'staff' | 'devotee'
  const [authType, setAuthType] = useState('pin'); // 'pin' or 'password'
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  // Form states
  const [mobile, setMobile] = useState('');
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Devotee DOB login
  const [dobDay, setDobDay] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear, setDobYear] = useState('');

  // OTP state
  const [otp, setOtp] = useState('');

  // Setup state
  const [setupData, setSetupData] = useState({
    password: '',
    confirmPassword: '',
    pin: '',
    confirmPin: ''
  });
  const [showSetupSecret, setShowSetupSecret] = useState(false);

  const isMobileValid = mobile.length === 10;
  const isPinValid = pin.length === 6;
  const isDobValid = dobDay.length === 2 && dobMonth.length === 2 && dobYear.length === 4;

  const handleMobileChange = (e) => {
    setMobile(e.target.value.replace(/\D/g, ''));
    setErrorMessage('');
    setInfoMessage('');
  };

  const handleDobLogin = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    if (!isMobileValid) return setErrorMessage('Enter a valid 10-digit mobile number');
    if (!isDobValid) return setErrorMessage('Enter your complete date of birth (DD-MM-YYYY)');
    setLoading(true);
    try {
      const dobStr = `${dobDay}${dobMonth}${dobYear}`;
      const res = await dataService.loginWithDob(mobile, dobStr);
      onLoginSuccess(res.user);
    } catch (err) {
      setErrorMessage(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    if (!isMobileValid) return setErrorMessage('Enter a valid 10-digit mobile number');

    setLoading(true);
    try {
      if (authType === 'pin') {
        if (!isPinValid) {
          setLoading(false);
          return setErrorMessage('Enter your 6-digit PIN');
        }
        const res = await dataService.loginWithPin(mobile, pin);
        onLoginSuccess(res.user);
      } else {
        if (!password) {
          setLoading(false);
          return setErrorMessage('Enter your password');
        }
        const res = await dataService.loginWithPassword(mobile, password);
        onLoginSuccess(res.user);
      }
    } catch (err) {
      setErrorMessage(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotOrSetup = async () => {
    if (!isMobileValid) return setErrorMessage('Enter your mobile number first');
    setLoading(true);
    setErrorMessage('');
    try {
      const res = await dataService.requestOtp(mobile);
      setInfoMessage(res.message);
      setMode(MODE.OTP);
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e?.preventDefault();
    if (otp.length !== 6) return setErrorMessage('Enter all 6 OTP digits');
    setLoading(true);
    setErrorMessage('');
    try {
      await dataService.verifyOtp(mobile, otp);
      setMode(MODE.SETUP);
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteSetup = async (e) => {
    e.preventDefault();
    if (setupData.password.length < 6) return setErrorMessage('Password must be at least 6 characters');
    if (setupData.password !== setupData.confirmPassword) return setErrorMessage('Passwords do not match');
    if (setupData.pin.length !== 6) return setErrorMessage('PIN must be exactly 6 digits');
    if (setupData.pin !== setupData.confirmPin) return setErrorMessage('PINs do not match');

    setLoading(true);
    setErrorMessage('');
    try {
      const res = await dataService.completeSetup(mobile, setupData.password, setupData.pin);
      onLoginSuccess(res.user);
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

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
            {/* MAIN LOGIN MODE */}
            {mode === MODE.MAIN && (
              <>
                <div className="mb-5 text-center">
                  <h2 className="text-2xl font-bold text-text-main">Welcome Back</h2>
                  <p className="text-sm font-medium text-text-muted mt-1">Jai Swaminarayan 🙏</p>
                </div>

                {/* Top tab: Staff | Devotee */}
                <div className="flex rounded-2xl border border-border-light bg-bg-base p-1 mb-4">
                  <button type="button"
                    onClick={() => { setLoginTab('staff'); setErrorMessage(''); }}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all ${loginTab === 'staff' ? 'bg-surface text-text-main shadow-sm' : 'text-text-muted'}`}>
                    <KeyRound className="h-4 w-4" /> Admin / Sevak
                  </button>
                  <button type="button"
                    onClick={() => { setLoginTab('devotee'); setErrorMessage(''); }}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all ${loginTab === 'devotee' ? 'bg-surface text-text-main shadow-sm' : 'text-text-muted'}`}>
                    <User className="h-4 w-4" /> Devotee
                  </button>
                </div>

                {/* ── STAFF LOGIN ── */}
                {loginTab === 'staff' && (
                  <form onSubmit={handleLoginSubmit} className="space-y-4">
                    {/* PIN vs Password sub-tab */}
                    <div className="flex rounded-xl border border-border-light bg-bg-base p-0.5 gap-0.5">
                      <button type="button" onClick={() => { setAuthType('pin'); setErrorMessage(''); }}
                        className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-all ${authType === 'pin' ? 'bg-surface text-text-main shadow-sm' : 'text-text-muted'}`}>
                        <KeyRound className="h-3.5 w-3.5" /> PIN
                      </button>
                      <button type="button" onClick={() => { setAuthType('password'); setErrorMessage(''); }}
                        className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-all ${authType === 'password' ? 'bg-surface text-text-main shadow-sm' : 'text-text-muted'}`}>
                        <Lock className="h-3.5 w-3.5" /> Password
                      </button>
                    </div>

                    {/* Mobile */}
                    <div className="rounded-2xl border border-border-light bg-surface px-4 py-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-[#003158]/10 transition-all">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1">Mobile Number</label>
                      <div className="flex items-center gap-3">
                        <Phone className="h-5 w-5 text-text-muted" />
                        <span className="text-sm font-bold text-text-main">+91</span>
                        <input type="text" inputMode="numeric" maxLength={10} value={mobile} onChange={handleMobileChange}
                          placeholder="10-digit mobile number"
                          className="w-full bg-transparent text-sm font-semibold text-text-main outline-none placeholder:text-slate-300" />
                      </div>
                    </div>

                    {/* Password or PIN */}
                    {authType === 'password' ? (
                      <div className="rounded-2xl border border-border-light bg-surface px-4 py-3 focus-within:border-primary transition-all">
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1">Password</label>
                        <div className="flex items-center gap-3">
                          <Lock className="h-5 w-5 text-text-muted" />
                          <input type={showPassword ? 'text' : 'password'} value={password}
                            onChange={(e) => { setPassword(e.target.value); setErrorMessage(''); }}
                            placeholder="Enter your password"
                            className="w-full bg-transparent text-sm font-semibold text-text-main outline-none placeholder:text-slate-300" />
                          <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-text-muted hover:text-text-main">
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <span className="text-xs font-bold text-text-muted mb-2 block px-1">6-Digit PIN</span>
                        <PinDigitInput length={6} value={pin} onChange={(val) => { setPin(val); setErrorMessage(''); }} onComplete={() => {}} masked={true} />
                      </div>
                    )}

                    {errorMessage && (
                      <div className="flex items-center gap-2.5 rounded-2xl border border-red-100 bg-red-50 p-3 text-red-600">
                        <AlertCircle className="h-4 w-4 flex-shrink-0" /><p className="text-xs font-semibold">{errorMessage}</p>
                      </div>
                    )}
                    {infoMessage && (
                      <div className="flex items-center gap-2.5 rounded-2xl border border-blue-100 bg-blue-50 p-3 text-blue-600">
                        <CheckCircle className="h-4 w-4 flex-shrink-0" /><p className="text-xs font-semibold">{infoMessage}</p>
                      </div>
                    )}

                    <button type="submit" disabled={loading || (authType === 'pin' && !isPinValid)}
                      className="w-full rounded-2xl bg-primary py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:bg-[#00223f] active:scale-[0.99] disabled:opacity-50">
                      {loading ? 'Authenticating...' : 'Sign In →'}
                    </button>
                    <button type="button" onClick={handleForgotOrSetup}
                      className="w-full text-center text-xs font-bold text-[#FF862A] hover:underline pt-1">
                      Forgot Password / First Time Setup
                    </button>
                  </form>
                )}

                {/* ── DEVOTEE LOGIN ── */}
                {loginTab === 'devotee' && (
                  <form onSubmit={handleDobLogin} className="space-y-4">
                    <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs font-semibold text-primary">
                      <p>Enter your registered mobile number and date of birth to access your profile.</p>
                    </div>

                    {/* Mobile */}
                    <div className="rounded-2xl border border-border-light bg-surface px-4 py-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-[#003158]/10 transition-all">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1">Mobile Number</label>
                      <div className="flex items-center gap-3">
                        <Phone className="h-5 w-5 text-text-muted" />
                        <span className="text-sm font-bold text-text-main">+91</span>
                        <input type="text" inputMode="numeric" maxLength={10} value={mobile} onChange={handleMobileChange}
                          placeholder="10-digit mobile number"
                          className="w-full bg-transparent text-sm font-semibold text-text-main outline-none placeholder:text-slate-300" />
                      </div>
                    </div>

                    {/* DOB — 3 fields DD / MM / YY */}
                    <div className="rounded-2xl border border-border-light bg-surface px-4 py-3 focus-within:border-primary transition-all">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-2">
                        <Calendar className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
                        Date of Birth
                      </label>
                      <div className="flex items-center gap-2">
                        <input type="text" inputMode="numeric" maxLength={2} value={dobDay}
                          onChange={e => { setDobDay(e.target.value.replace(/\D/g,'')); setErrorMessage(''); }}
                          placeholder="DD" className="w-14 rounded-xl border border-border-light bg-bg-base px-3 py-2 text-center text-sm font-bold text-text-main outline-none focus:border-primary" />
                        <span className="text-text-muted font-bold">-</span>
                        <input type="text" inputMode="numeric" maxLength={2} value={dobMonth}
                          onChange={e => { setDobMonth(e.target.value.replace(/\D/g,'')); setErrorMessage(''); }}
                          placeholder="MM" className="w-14 rounded-xl border border-border-light bg-bg-base px-3 py-2 text-center text-sm font-bold text-text-main outline-none focus:border-primary" />
                        <span className="text-text-muted font-bold">-</span>
                        <input type="text" inputMode="numeric" maxLength={4} value={dobYear}
                          onChange={e => { setDobYear(e.target.value.replace(/\D/g,'')); setErrorMessage(''); }}
                          placeholder="YYYY" className="w-20 rounded-xl border border-border-light bg-bg-base px-3 py-2 text-center text-sm font-bold text-text-main outline-none focus:border-primary" />
                        <span className="text-xs text-text-muted ml-1">e.g. 01-12-1995</span>
                      </div>
                    </div>

                    {errorMessage && (
                      <div className="flex items-center gap-2.5 rounded-2xl border border-red-100 bg-red-50 p-3 text-red-600">
                        <AlertCircle className="h-4 w-4 flex-shrink-0" /><p className="text-xs font-semibold">{errorMessage}</p>
                      </div>
                    )}

                    <button type="submit" disabled={loading || !isMobileValid || !isDobValid}
                      className="w-full rounded-2xl bg-primary py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:bg-[#00223f] active:scale-[0.99] disabled:opacity-50">
                      {loading ? 'Verifying...' : 'Access My Profile →'}
                    </button>
                  </form>
                )}
              </>
            )}

            {/* OTP VERIFICATION MODE */}
            {mode === MODE.OTP && (
              <div>
                <div className="mb-6 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FF862A]/10 text-[#FF862A]">
                    <MessageCircle className="h-6 w-6" />
                  </div>
                  <h2 className="text-2xl font-bold text-text-main">Check WhatsApp</h2>
                  <p className="text-sm font-medium text-text-muted mt-1">
                    OTP sent to <span className="font-bold text-[#FF862A]">+91 {mobile}</span>
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">(Demo OTP: 123456)</p>
                </div>

                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <PinDigitInput
                    length={6}
                    value={otp}
                    onChange={(val) => { setOtp(val); setErrorMessage(''); }}
                    onComplete={() => handleVerifyOtp()}
                  />

                  {errorMessage && (
                    <div className="flex items-center gap-2.5 rounded-2xl border border-red-100 bg-red-50 p-3 text-red-600">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      <p className="text-xs font-semibold">{errorMessage}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading || otp.length !== 6}
                    className="w-full rounded-2xl bg-primary py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:bg-[#00223f] disabled:opacity-50"
                  >
                    {loading ? 'Verifying...' : 'Verify OTP'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode(MODE.MAIN)}
                    className="w-full text-center text-xs font-bold text-text-muted hover:text-text-main"
                  >
                    ← Back to Sign In
                  </button>
                </form>
              </div>
            )}

            {/* SETUP MODE */}
            {mode === MODE.SETUP && (
              <div>
                <div className="mb-6 text-center">
                  <h2 className="text-2xl font-bold text-text-main">Account Setup</h2>
                  <p className="text-sm font-medium text-text-muted mt-1">Set a password and your 6-digit PIN</p>
                </div>

                <form onSubmit={handleCompleteSetup} className="space-y-4">
                  <div className="rounded-2xl border border-border-light bg-surface px-4 py-3">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1">New Password</label>
                    <input
                      type={showSetupSecret ? 'text' : 'password'}
                      value={setupData.password}
                      onChange={(e) => setSetupData({ ...setupData, password: e.target.value })}
                      placeholder="At least 6 characters"
                      className="w-full text-sm font-semibold text-text-main outline-none"
                    />
                  </div>

                  <div className="rounded-2xl border border-border-light bg-surface px-4 py-3">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1">Confirm Password</label>
                    <input
                      type={showSetupSecret ? 'text' : 'password'}
                      value={setupData.confirmPassword}
                      onChange={(e) => setSetupData({ ...setupData, confirmPassword: e.target.value })}
                      placeholder="Re-enter password"
                      className="w-full text-sm font-semibold text-text-main outline-none"
                    />
                  </div>

                  <div>
                    <span className="text-xs font-bold text-text-muted mb-1 block">New 6-Digit PIN</span>
                    <PinDigitInput
                      length={6}
                      value={setupData.pin}
                      onChange={(val) => setSetupData({ ...setupData, pin: val })}
                      masked={!showSetupSecret}
                    />
                  </div>

                  <div>
                    <span className="text-xs font-bold text-text-muted mb-1 block">Confirm 6-Digit PIN</span>
                    <PinDigitInput
                      length={6}
                      value={setupData.confirmPin}
                      onChange={(val) => setSetupData({ ...setupData, confirmPin: val })}
                      masked={!showSetupSecret}
                    />
                  </div>

                  {errorMessage && (
                    <div className="flex items-center gap-2.5 rounded-2xl border border-red-100 bg-red-50 p-3 text-red-600">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      <p className="text-xs font-semibold">{errorMessage}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-2xl bg-primary py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:bg-[#00223f] disabled:opacity-50"
                  >
                    Complete Setup & Sign In
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
