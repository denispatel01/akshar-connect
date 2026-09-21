import React, { useState } from 'react';
import { Lock, Eye, EyeOff, MessageCircle, Phone, KeyRound, Sparkles, CheckCircle, AlertCircle } from 'lucide-react';
import PinDigitInput from '../components/PinDigitInput';
import { dataService } from '../services/dataService';

const MODE = {
  MAIN: 'main',
  OTP: 'otp',
  SETUP: 'setup'
};

export default function LoginPage({ onLoginSuccess }) {
  const [mode, setMode] = useState(MODE.MAIN);
  const [authType, setAuthType] = useState('pin'); // 'pin' or 'password'
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  // Form states
  const [mobile, setMobile] = useState('');
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

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

  const handleMobileChange = (e) => {
    setMobile(e.target.value.replace(/\D/g, ''));
    setErrorMessage('');
    setInfoMessage('');
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
          return setErrorMessage('Enter all 6 PIN digits');
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
    <div className="flex h-screen flex-col overflow-hidden bg-[#F0F4F8]">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left Side Hero Banner - Desktop */}
        <div className="relative hidden overflow-hidden lg:block lg:w-[48%] xl:w-1/2 bg-[#001F3D]">
          <div className="absolute inset-0 bg-gradient-to-t from-[#001F3D] via-[#002A50]/70 to-transparent z-10" />
          <div
            className="absolute inset-0 z-0 opacity-60"
            style={{
              background: 'radial-gradient(ellipse 80% 80% at 20% 90%, rgba(255,134,42,0.35) 0%, transparent 70%)'
            }}
          />
          <div className="absolute inset-x-0 bottom-0 z-20 p-10 xl:p-14">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-white backdrop-blur-md">
              <Sparkles className="h-4 w-4 text-[#FF862A]" />
              Akshar Connect
            </span>
            <h2 className="font-display text-4xl font-extrabold leading-tight text-white xl:text-5xl">
              Jai Swaminarayan
            </h2>
            <p className="mt-3 max-w-md text-base leading-relaxed text-white/80">
              Sign in to manage your Mandal — attendance, events, seva, and devotee records in one central platform.
            </p>

            <div className="mt-8 flex items-center gap-4 text-xs font-semibold text-white/60">
              <span>🔑 Admin PIN: <strong className="text-white bg-white/10 px-2 py-0.5 rounded">786109</strong></span>
              <span>•</span>
              <span>⚡ Sevak PIN: <strong className="text-white bg-white/10 px-2 py-0.5 rounded">786369</strong></span>
            </div>
          </div>
        </div>

        {/* Right Side Login Form Container */}
        <div className="relative flex h-full flex-1 flex-col overflow-y-auto bg-white">
          {/* Header Branding */}
          <div className="relative flex flex-shrink-0 items-center justify-center gap-3 px-4 pb-2 pt-6 sm:pt-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#003158] text-white shadow-lg">
              <Sparkles className="h-6 w-6 text-[#FF862A]" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-[#9BB5CB] block">
                Akshar Satsang Mandal Presents
              </span>
              <h1 className="font-display text-2xl font-bold text-[#003158] leading-tight">
                Akshar Connect
              </h1>
            </div>
          </div>

          <div className="relative mx-auto flex w-full max-w-[480px] flex-1 flex-col justify-center px-6 py-8 sm:px-10">
            {/* MAIN LOGIN MODE */}
            {mode === MODE.MAIN && (
              <>
                <div className="mb-6 text-center">
                  <h2 className="text-2xl font-bold text-[#003158]">Welcome Back</h2>
                  <p className="text-sm font-medium text-[#9BB5CB] mt-1">Please enter your details to continue</p>
                </div>

                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  {/* Tab Selector: PIN vs Password */}
                  <div className="flex rounded-2xl border border-[#E4EBF3] bg-[#F0F4F8] p-1">
                    <button
                      type="button"
                      onClick={() => { setAuthType('pin'); setErrorMessage(''); }}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all ${
                        authType === 'pin' ? 'bg-white text-[#003158] shadow-sm' : 'text-[#9BB5CB]'
                      }`}
                    >
                      <KeyRound className="h-4 w-4" /> 6-Digit PIN
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAuthType('password'); setErrorMessage(''); }}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all ${
                        authType === 'password' ? 'bg-white text-[#003158] shadow-sm' : 'text-[#9BB5CB]'
                      }`}
                    >
                      <Lock className="h-4 w-4" /> Password
                    </button>
                  </div>

                  {/* Mobile Input Field */}
                  <div className="rounded-2xl border border-[#E0EAF4] bg-white px-4 py-3 focus-within:border-[#003158] focus-within:ring-2 focus-within:ring-[#003158]/10 transition-all">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[#9BB5CB] mb-1">
                      Mobile Number
                    </label>
                    <div className="flex items-center gap-3">
                      <Phone className="h-5 w-5 text-[#9BB5CB]" />
                      <span className="text-sm font-bold text-[#003158]">+91</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={10}
                        value={mobile}
                        onChange={handleMobileChange}
                        placeholder="Enter 10-digit mobile number"
                        className="w-full bg-transparent text-sm font-semibold text-[#003158] outline-none placeholder:text-slate-300"
                      />
                    </div>
                  </div>

                  {/* Password Input */}
                  {authType === 'password' ? (
                    <div className="rounded-2xl border border-[#E0EAF4] bg-white px-4 py-3 focus-within:border-[#003158] focus-within:ring-2 focus-within:ring-[#003158]/10 transition-all">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-[#9BB5CB] mb-1">
                        Password
                      </label>
                      <div className="flex items-center gap-3">
                        <Lock className="h-5 w-5 text-[#9BB5CB]" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => { setPassword(e.target.value); setErrorMessage(''); }}
                          placeholder="Enter your password"
                          className="w-full bg-transparent text-sm font-semibold text-[#003158] outline-none placeholder:text-slate-300"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="text-[#9BB5CB] hover:text-[#003158]"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* 6-Digit PIN Input */
                    <div>
                      <div className="flex justify-between items-center mb-2 px-1">
                        <span className="text-xs font-bold text-[#9BB5CB]">6-Digit PIN</span>
                        <span className="text-[11px] text-slate-400">Admin PIN: 786109 | Sevak: 786369</span>
                      </div>
                      <PinDigitInput
                        length={6}
                        value={pin}
                        onChange={(val) => { setPin(val); setErrorMessage(''); }}
                        onComplete={() => {}}
                        masked={true}
                      />
                    </div>
                  )}

                  {/* Error Notification */}
                  {errorMessage && (
                    <div className="flex items-center gap-2.5 rounded-2xl border border-red-100 bg-red-50 p-3 text-red-600">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      <p className="text-xs font-semibold">{errorMessage}</p>
                    </div>
                  )}

                  {/* Info Notification */}
                  {infoMessage && (
                    <div className="flex items-center gap-2.5 rounded-2xl border border-blue-100 bg-blue-50 p-3 text-blue-600">
                      <CheckCircle className="h-4 w-4 flex-shrink-0" />
                      <p className="text-xs font-semibold">{infoMessage}</p>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-2xl bg-[#003158] py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:bg-[#00223f] active:scale-[0.99] disabled:opacity-50"
                  >
                    {loading ? 'Authenticating...' : 'Sign In →'}
                  </button>

                  <button
                    type="button"
                    onClick={handleForgotOrSetup}
                    className="w-full text-center text-xs font-bold text-[#FF862A] hover:underline pt-2"
                  >
                    Forgot Password / First Time Setup
                  </button>
                </form>
              </>
            )}

            {/* OTP VERIFICATION MODE */}
            {mode === MODE.OTP && (
              <div>
                <div className="mb-6 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FF862A]/10 text-[#FF862A]">
                    <MessageCircle className="h-6 w-6" />
                  </div>
                  <h2 className="text-2xl font-bold text-[#003158]">Check WhatsApp</h2>
                  <p className="text-sm font-medium text-[#9BB5CB] mt-1">
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
                    className="w-full rounded-2xl bg-[#003158] py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:bg-[#00223f] disabled:opacity-50"
                  >
                    {loading ? 'Verifying...' : 'Verify OTP'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode(MODE.MAIN)}
                    className="w-full text-center text-xs font-bold text-[#9BB5CB] hover:text-[#003158]"
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
                  <h2 className="text-2xl font-bold text-[#003158]">Account Setup</h2>
                  <p className="text-sm font-medium text-[#9BB5CB] mt-1">Set a password and your 6-digit PIN</p>
                </div>

                <form onSubmit={handleCompleteSetup} className="space-y-4">
                  <div className="rounded-2xl border border-[#E0EAF4] bg-white px-4 py-3">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[#9BB5CB] mb-1">New Password</label>
                    <input
                      type={showSetupSecret ? 'text' : 'password'}
                      value={setupData.password}
                      onChange={(e) => setSetupData({ ...setupData, password: e.target.value })}
                      placeholder="At least 6 characters"
                      className="w-full text-sm font-semibold text-[#003158] outline-none"
                    />
                  </div>

                  <div className="rounded-2xl border border-[#E0EAF4] bg-white px-4 py-3">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[#9BB5CB] mb-1">Confirm Password</label>
                    <input
                      type={showSetupSecret ? 'text' : 'password'}
                      value={setupData.confirmPassword}
                      onChange={(e) => setSetupData({ ...setupData, confirmPassword: e.target.value })}
                      placeholder="Re-enter password"
                      className="w-full text-sm font-semibold text-[#003158] outline-none"
                    />
                  </div>

                  <div>
                    <span className="text-xs font-bold text-[#9BB5CB] mb-1 block">New 6-Digit PIN</span>
                    <PinDigitInput
                      length={6}
                      value={setupData.pin}
                      onChange={(val) => setSetupData({ ...setupData, pin: val })}
                      masked={!showSetupSecret}
                    />
                  </div>

                  <div>
                    <span className="text-xs font-bold text-[#9BB5CB] mb-1 block">Confirm 6-Digit PIN</span>
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
                    className="w-full rounded-2xl bg-[#003158] py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:bg-[#00223f] disabled:opacity-50"
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
