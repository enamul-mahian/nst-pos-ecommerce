import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { User, Phone, Mail, Lock, Eye, EyeOff, UserPlus, ArrowRight, LogIn, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

import { useAuthStore } from '../../store/auth/useAuthStore';
import HCaptchaField, { HCaptchaHandle } from '../../components/security/HCaptchaField';
import { useT } from '../../i18n';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { register, isLoading, error, clearError, isAuthenticated } = useAuthStore();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const captcha = useRef<HCaptchaHandle>(null);
  const onCaptchaStatus = useCallback((enabled: boolean | null) => setCaptchaEnabled(Boolean(enabled)), []);
  const t = useT();

  // Capture where the user was redirected from (default to portal dashboard)
  const redirectDestination = (location.state as any)?.from || '/portal/dashboard';

  // If already authenticated, redirect straight away to destination
  useEffect(() => {
    if (isAuthenticated) {
      navigate(redirectDestination, { replace: true });
    }
    return () => {
      clearError();
    };
  }, [isAuthenticated, navigate, redirectDestination, clearError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Core Frontend validations
    if (!name.trim()) {
      toast.error('Please enter your full name.');
      return;
    }
    if (!phone.trim()) {
      toast.error('Please enter your registered phone number.');
      return;
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters long.');
      return;
    }

    if (captchaEnabled && !captchaToken) {
      toast.error(t('auth.captcha_required'));
      return;
    }

    try {
      await register(name, phone, password, email || undefined, captchaToken);
      toast.success('Congratulations! Your account has been created successfully.');
      navigate(redirectDestination, { replace: true });
    } catch (err: any) {
      captcha.current?.reset();
      toast.error(err.message || 'Registration failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-[#0c051a] flex flex-col justify-center items-center py-12 px-4 relative overflow-hidden select-none">
      
      {/* Dynamic SEO metadata */}
      <Helmet>
        <title>Create Customer Account | New Singapur Telecom</title>
        <meta name="description" content="Create a new New Singapur Telecom portal account to access exclusive offers, save addresses, and track your orders." />
      </Helmet>

      {/* Decorative glowing gradient inside background */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-3xl pointer-events-none z-0"></div>

      <div className="w-full max-w-md bg-white rounded-3xl border border-gray-100 shadow-2xl p-6 sm:p-10 z-10 relative flex flex-col items-center">
        
        {/* NST Brand Logo (Layout 6 SPEC) */}
        <Link to="/" className="flex items-center gap-1.5 shrink-0 group mb-6">
          <div className="bg-[var(--nst-primary)] text-white font-black text-sm px-2.5 py-1 rounded tracking-wider shadow">
            NST
          </div>
          <div className="flex flex-col leading-none text-left">
            <span className="text-slate-800 font-extrabold text-[11px] tracking-wide">
              NEW SINGAPUR
            </span>
            <span className="text-[var(--nst-primary)] text-[9px] font-bold tracking-widest mt-0.5">
              TELECOM
            </span>
          </div>
        </Link>

        {/* Section Header */}
        <div className="flex flex-col items-center text-center gap-2 mb-8">
          <div className="flex items-center gap-1 bg-[var(--nst-primary)]/10 text-[var(--nst-primary)] text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md border border-purple-500/10 mb-1">
            <Sparkles className="w-3.5 h-3.5 text-[#ffb800] fill-current" />
            <span>Join Portal</span>
          </div>
          <h2 className="text-slate-800 font-black text-xl">Create Account</h2>
          <p className="text-gray-400 text-xs font-semibold">Join us to experience original devices with trusted warranty.</p>
        </div>

        {/* Error warning bar */}
        {error && (
          <div className="w-full bg-red-50 border border-red-100 p-3.5 rounded-xl text-red-600 text-xs font-semibold text-left mb-5">
            {error}
          </div>
        )}

        {/* Register Form */}
        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
          
          {/* Full Name Field */}
          <div className="flex flex-col text-left gap-1.5">
            <label className="text-xs text-slate-800 font-bold uppercase tracking-wider">Full Name</label>
            <div className="flex items-center border border-gray-200 rounded-xl px-3 h-11 bg-slate-50 focus-within:border-[var(--nst-primary)] transition-all">
              <User className="w-4.5 h-4.5 text-gray-400 shrink-0" />
              <input
                type="text"
                required
                placeholder="Enter your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isLoading}
                className="flex-grow px-3 py-2 text-slate-800 text-sm focus:outline-none bg-transparent placeholder-gray-400 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Phone Field */}
          <div className="flex flex-col text-left gap-1.5">
            <label className="text-xs text-slate-800 font-bold uppercase tracking-wider">Phone Number</label>
            <div className="flex items-center border border-gray-200 rounded-xl px-3 h-11 bg-slate-50 focus-within:border-[var(--nst-primary)] transition-all">
              <Phone className="w-4 h-4 text-gray-400 shrink-0" />
              <input
                type="tel"
                required
                placeholder="Enter valid phone number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={isLoading}
                className="flex-grow px-3 py-2 text-slate-800 text-sm focus:outline-none bg-transparent placeholder-gray-400 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Email Field (Optional) */}
          <div className="flex flex-col text-left gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-800 font-bold uppercase tracking-wider">Email Address</label>
              <span className="text-[10px] text-gray-400 font-bold">Optional</span>
            </div>
            <div className="flex items-center border border-gray-200 rounded-xl px-3 h-11 bg-slate-50 focus-within:border-[var(--nst-primary)] transition-all">
              <Mail className="w-4 h-4 text-gray-400 shrink-0" />
              <input
                type="email"
                placeholder="Enter email address (optional)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                className="flex-grow px-3 py-2 text-slate-800 text-sm focus:outline-none bg-transparent placeholder-gray-400 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Password Field */}
          <div className="flex flex-col text-left gap-1.5">
            <label className="text-xs text-slate-800 font-bold uppercase tracking-wider">Create Password</label>
            <div className="flex items-center border border-gray-200 rounded-xl px-3 h-11 bg-slate-50 focus-within:border-[var(--nst-primary)] transition-all">
              <Lock className="w-4 h-4 text-gray-400 shrink-0" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="Create secure password (min 6 chars)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                className="flex-grow px-3 py-2 text-slate-800 text-sm focus:outline-none bg-transparent placeholder-gray-400 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="p-1 hover:bg-gray-150 rounded-full text-gray-400 hover:text-slate-800 shrink-0 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <HCaptchaField ref={captcha} form="customer_registration" onToken={setCaptchaToken} onStatus={onCaptchaStatus} />

          {/* Submit Registration button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-[var(--nst-primary)] hover:bg-purple-600 disabled:bg-purple-300 text-white font-black text-xs sm:text-sm py-3.5 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer mt-3 disabled:cursor-not-allowed"
          >
            <UserPlus className="w-4.5 h-4.5" />
            <span>{isLoading ? 'Creating account...' : 'Create Account'}</span>
          </button>

          {/* Divider */}
          <div className="flex items-center my-4 w-full text-gray-300 text-xs font-semibold select-none">
            <hr className="flex-grow border-gray-200" />
            <span className="px-3">or</span>
            <hr className="flex-grow border-gray-200" />
          </div>

          {/* Redirect to Login */}
          <Link
            to="/login"
            state={{ from: redirectDestination }}
            className="w-full border border-gray-200 text-slate-700 hover:bg-slate-50 font-black text-xs sm:text-sm py-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            <LogIn className="w-4.5 h-4.5 text-gray-400" />
            <span>Login to Existing Account</span>
          </Link>

        </form>

      </div>
    </div>
  );
};

export default RegisterPage;