import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';

import {
  Navigate,
  useNavigate
} from 'react-router-dom';

import { Helmet } from 'react-helmet-async';

import {
  BadgeDollarSign,
  Boxes,
  ClipboardList,
  Eye,
  EyeOff,
  Headphones,
  LockKeyhole,
  LogIn,
  PackageCheck,
  ScanLine,
  ShieldCheck
} from 'lucide-react';

import { useSupplierAuthStore } from '../../store/supplier/useSupplierAuthStore';
import HCaptchaField, { HCaptchaHandle } from '../../components/security/HCaptchaField';
import { useT } from '../../i18n';
import useNstCentralLogo from '../../hooks/useNstCentralLogo';



export default function SupplierLoginPage() {
  const t = useT();
  const nav = useNavigate();

  const {
    login,
    isLoading,
    error,
    isAuthenticated,
    initialize
  } = useSupplierAuthStore();

  const logo = useNstCentralLogo();

  const [credential, setCredential] =
    useState('');

  const [password, setPassword] =
    useState('');

  const [showPassword, setShowPassword] =
    useState(false);

  const [captchaToken, setCaptchaToken] =
    useState('');

  const [
    captchaEnabled,
    setCaptchaEnabled
  ] = useState(false);

  const [localError, setLocalError] =
    useState('');

  const captcha =
    useRef<HCaptchaHandle>(null);

  const onCaptchaStatus =
    useCallback(
      (enabled: boolean | null) =>
        setCaptchaEnabled(Boolean(enabled)),
      []
    );

  useEffect(
    () => initialize(),
    [initialize]
  );

  if (isAuthenticated) {
    return (
      <Navigate
        to="/supplier/dashboard"
        replace
      />
    );
  }

  const submit = async (
    e: FormEvent
  ) => {
    e.preventDefault();

    setLocalError('');

    if (
      captchaEnabled &&
      !captchaToken
    ) {
      setLocalError(
        t('auth.captcha_required')
      );

      return;
    }

    try {
      await login(
        credential,
        password,
        captchaToken
      );

      nav(
        '/supplier/dashboard',
        { replace: true }
      );
    } catch {
      captcha.current?.reset();
    }
  };

  const shownError =
    localError || error;

  const features = [
    {
      icon: Boxes,
      title: 'Supply Smartphones & Gadgets',
      text: 'Phones, accessories, parts and more'
    },
    {
      icon: ClipboardList,
      title: 'Manage Purchase Orders',
      text: 'PO, invoices and payments'
    },
    {
      icon: ScanLine,
      title: 'Track Stock & IMEI',
      text: 'Serials, stock and batch details'
    },
    {
      icon: BadgeDollarSign,
      title: 'Dealer Pricing & Warranty',
      text: 'Pricing, warranty and replacement'
    }
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#031712] text-white">

      <Helmet>
        <title>
          Supplier Login | New Singapur Telecom
        </title>

        <meta
          name="description"
          content="Secure supplier access for New Singapur Telecom smartphone and gadget partners."
        />
      </Helmet>

      <div className="nst-supplier-ambient pointer-events-none fixed inset-0">

        <div className="absolute -left-40 top-0 h-[600px] w-[600px] rounded-full bg-emerald-400/10 blur-[120px]" />

        <div className="absolute bottom-0 right-0 h-[600px] w-[600px] rounded-full bg-teal-400/10 blur-[120px]" />

        <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,.025)_1px,transparent_1px)] bg-[size:48px_48px]" />

      </div>

      <div className="relative mx-auto grid min-h-screen max-w-[1500px] grid-cols-1 items-center gap-10 px-5 py-10 lg:grid-cols-[1.05fr_.95fr] lg:px-12">

        {/* LEFT */}
        <section className="flex min-h-[650px] flex-col justify-center">

          <div className="mb-12 flex items-center gap-4">

            <img
  src={logo}
  alt="New Singapur Telecom"
  className="h-14 w-14 shrink-0 object-contain"
/>

            <div>
              <div className="text-lg font-black">
                NEW SINGAPUR TELECOM
              </div>

              <div className="text-[10px] font-bold tracking-[.24em] text-slate-400">
                SMARTPHONE · GADGETS · ACCESSORIES
              </div>
            </div>

          </div>

          <div className="max-w-xl">

            <div className="mb-3 flex items-center gap-3 text-sm font-black uppercase tracking-[.15em] text-emerald-400">
              <span className="h-[2px] w-8 bg-emerald-400" />
              Supplier Portal
            </div>

            <h1 className="text-5xl font-black leading-[.96] tracking-[-.045em] sm:text-6xl xl:text-7xl">
              Powering Your
              <br />

              <span className="text-emerald-400">
                Gadget Supply
              </span>
            </h1>

            <p className="mt-6 max-w-lg text-base leading-7 text-slate-300">
              Partner with New Singapur Telecom for a stronger smartphone and gadget supply chain.
            </p>

            <div className="mt-8 grid gap-4">

              {features.map(
                ({ icon: Icon, title, text }) => (
                  <div
                    key={title}
                    className="flex items-center gap-4"
                  >
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-emerald-400/20 bg-emerald-400/10 text-emerald-400">
                      <Icon size={20} />
                    </div>

                    <div>
                      <div className="text-sm font-black">
                        {title}
                      </div>

                      <div className="mt-1 text-xs text-slate-400">
                        {text}
                      </div>
                    </div>
                  </div>
                )
              )}

            </div>

          </div>

          {/* IPHONE PRODUCT */}
          <div className="nst-supplier-phone-card relative mt-8 max-w-[550px] overflow-hidden rounded-[2rem] border border-emerald-400/15 bg-[#071f19] p-5 shadow-[0_20px_70px_rgba(16,185,129,.12)]">

            <div className="absolute right-5 top-5 z-10 text-right">

              <div className="font-black">
                iPhone 18 Pro Max
              </div>

              <div className="text-[10px] font-black uppercase tracking-[.14em] text-emerald-400">
                Built for a stronger supply chain
              </div>

            </div>

            <img
              src="/iphone-18-pro-max.png"
              alt="iPhone 18 Pro Max"
              className="mx-auto h-[255px] w-auto max-w-full object-contain drop-shadow-[0_30px_35px_rgba(0,0,0,.55)]"
              onError={(event) => {
                event.currentTarget.style.display = 'none';
              }}
            />

          </div>

          <div className="mt-5 grid max-w-[700px] grid-cols-2 gap-3 sm:grid-cols-4">

            <SupplierBadge
              icon={PackageCheck}
              title="Bulk Orders"
            />

            <SupplierBadge
              icon={Boxes}
              title="Live Stock"
            />

            <SupplierBadge
              icon={ShieldCheck}
              title="Secure"
            />

            <SupplierBadge
              icon={Headphones}
              title="Support"
            />

          </div>

        </section>

        {/* LOGIN CARD */}
        <section className="flex justify-center">

          <div className="nst-supplier-login-wrap relative w-full max-w-[510px]">

            <div className="absolute -inset-[2px] rounded-[2rem] bg-gradient-to-br from-emerald-400 via-emerald-400/20 to-transparent blur-sm" />

            <div className="relative rounded-[2rem] border border-emerald-400/40 bg-[#061d18]/95 p-7 shadow-[0_30px_100px_rgba(16,185,129,.16)] backdrop-blur-xl sm:p-10">

              <div className="mb-8 text-center">

                {logo ? (
                  <img
                    src={logo}
                    alt="New Singapur Telecom"
                    className="mx-auto mb-5 max-h-20 w-auto max-w-[180px] object-contain"
                  />
                ) : null}

                <h2 className="text-2xl font-black">
                  New Singapur Telecom
                </h2>

                <p className="mt-1 text-sm text-slate-400">
                  Supplier Portal
                </p>

              </div>

              <p className="mb-6 text-sm leading-6 text-slate-300">
                Secure access for approved smartphone and gadget suppliers.
              </p>

              <form
                onSubmit={submit}
                className="space-y-5"
              >

                <label className="block">

                  <span className="mb-2 block text-sm font-bold">
                    Email or supplier ID
                  </span>

                  <input
                    required
                    autoComplete="username"
                    value={credential}
                    onChange={(e) =>
                      setCredential(e.target.value)
                    }
                    placeholder="Enter email, phone or supplier ID"
                    className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/10"
                  />

                </label>

                <label className="block">

                  <span className="mb-2 block text-sm font-bold">
                    Password
                  </span>

                  <div className="flex h-12 items-center rounded-xl border border-white/10 bg-white/5 px-4 focus-within:border-emerald-400 focus-within:ring-4 focus-within:ring-emerald-400/10">

                    <LockKeyhole
                      size={18}
                      className="shrink-0 text-slate-500"
                    />

                    <input
                      required
                      type={
                        showPassword
                          ? 'text'
                          : 'password'
                      }
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) =>
                        setPassword(
                          e.target.value
                        )
                      }
                      placeholder="Enter password"
                      className="w-full bg-transparent px-3 text-sm text-white outline-none placeholder:text-slate-500"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowPassword(
                          !showPassword
                        )
                      }
                      className="text-slate-500 hover:text-emerald-400"
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
                  form="supplier_login"
                  onToken={setCaptchaToken}
                  onStatus={onCaptchaStatus}
                  dark
                />

                {shownError ? (
                  <p
                    className="rounded-xl border border-red-400/10 bg-red-500/10 p-3 text-sm text-red-300"
                    role="alert"
                  >
                    {shownError}
                  </p>
                ) : null}

                <button
                  disabled={isLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3.5 font-black text-[#032019] shadow-lg shadow-emerald-400/20 transition hover:-translate-y-0.5 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <LogIn size={18} />

                  {isLoading
                    ? t(
                        'supplier_login.signing_in'
                      )
                    : t(
                        'supplier_login.submit'
                      )}
                </button>

              </form>

              <div className="mt-7 border-t border-white/10 pt-6 text-center text-xs text-slate-400">
                Need supplier access? Contact New Singapur Telecom.
              </div>

              <p className="mt-7 text-center text-[11px] text-slate-500">
                © {new Date().getFullYear()} New Singapur Telecom. All rights reserved.
              </p>

            </div>

          </div>

        </section>

      </div>

    </main>
  );
}

function SupplierBadge({
  icon: Icon,
  title
}: {
  icon: any;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-emerald-400/10 bg-white/[.035] px-3 py-3">

      <Icon
        size={18}
        className="text-emerald-400"
      />

      <span className="text-[11px] font-black">
        {title}
      </span>

    </div>
  );
}




