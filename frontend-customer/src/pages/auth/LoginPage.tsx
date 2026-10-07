import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ArrowRight,
  Eye,
  EyeOff,
  Gift,
  Headphones,
  Lock,
  LockKeyhole,
  Phone,
  ShieldCheck,
  ShoppingCart,
  Truck,
  UserPlus
} from 'lucide-react';
import toast from 'react-hot-toast';

import { useAuthStore } from '../../store/auth/useAuthStore';
import HCaptchaField, { HCaptchaHandle } from '../../components/security/HCaptchaField';
import { useT } from '../../i18n';
import useNstCentralLogo from '../../hooks/useNstCentralLogo';



export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    login,
    isLoading,
    error,
    clearError,
    isAuthenticated
  } = useAuthStore();

  const logo = useNstCentralLogo();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaEnabled, setCaptchaEnabled] = useState(false);

  const captcha = useRef<HCaptchaHandle>(null);

  const onCaptchaStatus = useCallback(
    (enabled: boolean | null) =>
      setCaptchaEnabled(Boolean(enabled)),
    []
  );

  const t = useT();

  const redirectDestination =
    (location.state as any)?.from || '/portal/dashboard';

  const isRedirectedFromCheckout =
    typeof redirectDestination === 'object'
      ? redirectDestination.pathname?.includes('checkout')
      : redirectDestination.includes('checkout');

  useEffect(() => {
    if (isAuthenticated) {
      navigate(redirectDestination, {
        replace: true
      });
    }

    return () => {
      clearError();
    };
  }, [
    isAuthenticated,
    navigate,
    redirectDestination,
    clearError
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!phone.trim() || !password.trim()) {
      toast.error(
        'Please enter both your registered phone number and password.'
      );
      return;
    }

    if (captchaEnabled && !captchaToken) {
      toast.error(t('auth.captcha_required'));
      return;
    }

    try {
      await login(
        phone,
        password,
        captchaToken
      );

      toast.success(
        'Welcome back! Logged in successfully.'
      );

      navigate(
        redirectDestination,
        { replace: true }
      );
    } catch (err: any) {
      captcha.current?.reset();

      toast.error(
        err.message ||
        'Invalid credentials. Please try again.'
      );
    }
  };

  const features = [
    {
      icon: ShoppingCart,
      title: 'Browse & Order',
      text: 'Latest smartphones and gadgets'
    },
    {
      icon: Truck,
      title: 'Track Your Orders',
      text: 'Real-time order status'
    },
    {
      icon: Gift,
      title: 'Exclusive Deals',
      text: 'Special offers and discounts'
    },
    {
      icon: Headphones,
      title: 'Get Support',
      text: 'Fast and friendly customer care'
    }
  ];

  return (
    <main className="min-h-screen overflow-hidden bg-[#f6faff] text-slate-900">

      <Helmet>
        <title>
          Customer Login | New Singapur Telecom
        </title>

        <meta
          name="description"
          content="Login to your New Singapur Telecom customer portal."
        />
      </Helmet>

      <div className="nst-customer-ambient pointer-events-none fixed inset-0">
        <div className="absolute -left-40 top-20 h-[520px] w-[520px] rounded-full bg-blue-300/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[500px] w-[500px] rounded-full bg-cyan-200/20 blur-3xl" />
      </div>

      <div className="relative mx-auto grid min-h-screen w-full max-w-[1500px] grid-cols-1 items-center gap-10 px-5 py-10 lg:grid-cols-[1.05fr_.95fr] lg:px-12">

        {/* LEFT */}
        <section className="relative flex min-h-[620px] flex-col justify-center">

          <Link
            to="/"
            className="mb-12 flex items-center gap-4 self-start"
          >
            <img
  src={logo}
  alt="New Singapur Telecom"
  className="h-14 w-14 shrink-0 object-contain"
/>

            <div>
              <div className="text-lg font-black tracking-tight">
                NEW SINGAPUR TELECOM
              </div>

              <div className="text-[10px] font-bold tracking-[.24em] text-slate-500">
                SMARTPHONE · GADGETS · ACCESSORIES
              </div>
            </div>
          </Link>

          <div className="max-w-xl">

            <div className="mb-3 flex items-center gap-3 text-sm font-black uppercase tracking-[.15em] text-blue-600">
              <span className="h-[2px] w-8 bg-blue-600" />
              Customer Portal
            </div>

            <h1 className="text-5xl font-black leading-[.96] tracking-[-.045em] sm:text-6xl xl:text-7xl">
              Your Favourite
              <br />

              <span className="text-blue-600">
                Gadgets, Closer
              </span>
            </h1>

            <p className="mt-6 max-w-lg text-base leading-7 text-slate-600">
              Shop the latest smartphones, accessories and technology products with New Singapur Telecom.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">

              {features.map(({ icon: Icon, title, text }) => (
                <div
                  key={title}
                  className="flex items-center gap-4"
                >
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-blue-100 text-blue-600">
                    <Icon size={20} />
                  </div>

                  <div>
                    <div className="text-sm font-black">
                      {title}
                    </div>

                    <div className="mt-1 text-xs text-slate-500">
                      {text}
                    </div>
                  </div>
                </div>
              ))}

            </div>

          </div>

          {/* PRODUCT VISUAL */}
          <div className="nst-customer-phone-card relative mt-10 max-w-[520px] overflow-hidden rounded-[2rem] border border-blue-100 bg-gradient-to-br from-[#dbeaff] via-[#edf6ff] to-white p-6 shadow-xl shadow-blue-100/50">

            <div className="absolute right-5 top-5 z-10 text-right">
              <div className="font-black text-slate-900">
                iPhone 18 Pro Max
              </div>

              <div className="text-[10px] font-bold uppercase tracking-[.16em] text-blue-600">
                Next generation performance
              </div>
            </div>

            <img
              src="/iphone-18-pro-max.png"
              alt="iPhone 18 Pro Max"
              className="relative z-0 mx-auto h-[245px] w-auto max-w-full object-contain drop-shadow-2xl"
              onError={(event) => {
                event.currentTarget.style.display = 'none';
              }}
            />

          </div>

          <div className="mt-5 flex flex-wrap gap-3">

            <TrustBadge
              icon={ShieldCheck}
              title="100% Secure"
              text="Your data is protected"
            />

            <TrustBadge
              icon={Truck}
              title="Fast Delivery"
              text="Across Bangladesh"
            />

            <TrustBadge
              icon={Headphones}
              title="24/7 Support"
              text="We're always here"
            />

          </div>

        </section>

        {/* RIGHT */}
        <section className="flex items-center justify-center">

          <div className="nst-customer-login-card w-full max-w-[510px] rounded-[2rem] border border-blue-100 bg-white/95 p-7 shadow-[0_30px_80px_rgba(37,99,235,.14)] backdrop-blur-xl sm:p-10">

            <div className="mb-7 text-center">

              {logo ? (
                <img
                  src={logo}
                  alt="New Singapur Telecom"
                  className="mx-auto mb-4 max-h-20 w-auto max-w-[180px] object-contain"
                />
              ) : null}

              <h2 className="text-2xl font-black tracking-tight">
                New Singapur Telecom
              </h2>

              <p className="mt-1 text-sm font-medium text-slate-500">
                Customer Portal
              </p>

            </div>

            {isRedirectedFromCheckout ? (
              <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-center">
                <LockKeyhole className="mx-auto mb-2 text-blue-600" />

                <div className="font-black">
                  Login Required
                </div>

                <p className="mt-1 text-xs text-slate-500">
                  Login to continue with checkout.
                </p>
              </div>
            ) : null}

            {error ? (
              <div className="mb-5 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-600">
                {error}
              </div>
            ) : null}

            <form
              onSubmit={handleSubmit}
              className="space-y-5"
            >

              <label className="block">
                <span className="mb-2 block text-sm font-bold">
                  Mobile number
                </span>

                <div className="flex h-12 items-center rounded-xl border border-slate-200 bg-slate-50 px-4 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10">
                  <Phone
                    size={18}
                    className="shrink-0 text-slate-400"
                  />

                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={isLoading}
                    placeholder="Enter your registered mobile number"
                    className="w-full bg-transparent px-3 text-sm outline-none"
                  />
                </div>
              </label>

              <label className="block">

                <div className="mb-2 flex items-center justify-between">

                  <span className="text-sm font-bold">
                    Password
                  </span>

                  <Link
                    to="/contact"
                    className="text-xs font-bold text-blue-600 hover:underline"
                  >
                    Forgot password?
                  </Link>

                </div>

                <div className="flex h-12 items-center rounded-xl border border-slate-200 bg-slate-50 px-4 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10">

                  <Lock
                    size={18}
                    className="shrink-0 text-slate-400"
                  />

                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    placeholder="Enter your password"
                    className="w-full bg-transparent px-3 text-sm outline-none"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword(!showPassword)
                    }
                    className="text-slate-400 hover:text-blue-600"
                  >
                    {showPassword ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>

                </div>

              </label>

              <HCaptchaField
                ref={captcha}
                form="customer_login"
                onToken={setCaptchaToken}
                onStatus={onCaptchaStatus}
              />

              <button
                type="submit"
                disabled={isLoading}
                className="flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3.5 font-black text-white shadow-lg shadow-blue-500/20 transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading
                  ? 'Logging you in...'
                  : 'Sign In'}

                <ArrowRight size={18} />
              </button>

              <div className="flex items-center gap-3 py-1 text-xs font-semibold text-slate-400">
                <div className="h-px flex-1 bg-slate-200" />
                or
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <Link
                to="/register"
                state={{
                  from: redirectDestination
                }}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 font-black text-slate-700 transition hover:border-blue-300 hover:bg-blue-50"
              >
                <UserPlus size={18} />
                Create Account
              </Link>

            </form>

            <p className="mt-8 text-center text-[11px] text-slate-400">
              © {new Date().getFullYear()} New Singapur Telecom. All rights reserved.
            </p>

          </div>

        </section>

      </div>

    </main>
  );
};

function TrustBadge({
  icon: Icon,
  title,
  text
}: {
  icon: any;
  title: string;
  text: string;
}) {
  return (
    <div className="flex min-w-[150px] items-center gap-3 rounded-xl border border-blue-100 bg-white/70 px-3 py-2.5">
      <Icon
        size={20}
        className="text-blue-600"
      />

      <div>
        <div className="text-[11px] font-black">
          {title}
        </div>

        <div className="text-[9px] text-slate-500">
          {text}
        </div>
      </div>
    </div>
  );
}

export default LoginPage;




