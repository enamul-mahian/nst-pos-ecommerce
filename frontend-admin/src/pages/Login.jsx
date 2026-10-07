import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react';

import enAuth from '../i18n/locales/en/auth.json';
import bnAuth from '../i18n/locales/bn/auth.json';

const SCRIPT_ID = 'hcaptcha-api-script';
let scriptPromise = null;

function loadHcaptchaScript() {
  if (window.hcaptcha) {
    return Promise.resolve(window.hcaptcha);
  }

  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);

    if (existing) {
      existing.addEventListener(
        'load',
        () => resolve(window.hcaptcha),
        { once: true }
      );

      existing.addEventListener(
        'error',
        () => reject(new Error('hCaptcha script failed')),
        { once: true }
      );

      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src =
      'https://js.hcaptcha.com/1/api.js?render=explicit&recaptchacompat=off';

    script.async = true;
    script.defer = true;

    script.onload = () => resolve(window.hcaptcha);

    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('hCaptcha script failed'));
    };

    document.head.appendChild(script);
  });

  return scriptPromise;
}

function apiUrl(path) {
  const configured = String(
    import.meta.env.VITE_API_BASE_URL || ''
  ).trim();

  if (configured) {
    return `${configured.replace(/\/$/, '')}${path}`;
  }

  const host = window.location.hostname;

  if (host === '127.0.0.1' || host === 'localhost') {
    return `http://127.0.0.1:8000/api${path}`;
  }

  return `${window.location.origin}/api${path}`;
}

function initialLanguage() {
  try {
    return localStorage.getItem('nst_lang') === 'bn'
      ? 'bn'
      : 'en';
  } catch {
    return 'en';
  }
}

function initialTheme() {
  try {
    const saved = localStorage.getItem('nst_login_theme');

    if (saved === 'dark' || saved === 'light') {
      return saved;
    }

    return window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  } catch {
    return 'light';
  }
}

function readRecentAccounts() {
  try {
    const parsed = JSON.parse(
      localStorage.getItem('nst_recent_staff_logins') || '[]'
    );

    return Array.isArray(parsed)
      ? parsed.filter(Boolean).slice(0, 3)
      : [];
  } catch {
    return [];
  }
}

function saveRecentAccount(identifier) {
  if (!identifier) return;

  try {
    const current = readRecentAccounts().filter(
      (item) => item !== identifier
    );

    const next = [
      identifier,
      ...current
    ].slice(0, 3);

    localStorage.setItem(
      'nst_recent_staff_logins',
      JSON.stringify(next)
    );
  } catch {}
}

function translate(dictionary, key, params) {
  let value =
    dictionary?.[key] ??
    enAuth?.[key] ??
    key;

  if (params) {
    value = String(value).replace(
      /\{(\w+)\}/g,
      (whole, name) => {
        return params[name] === undefined ||
          params[name] === null
          ? whole
          : String(params[name]);
      }
    );
  }

  return value;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function responseMessage(response, data, fallback) {
  const firstFieldError =
    data?.errors &&
    typeof data.errors === 'object'
      ? Object.values(data.errors)
          .flat()
          .find((item) => typeof item === 'string')
      : '';

  if (firstFieldError) return firstFieldError;

  if (
    typeof data?.message === 'string' &&
    data.message.trim()
  ) {
    return data.message.trim();
  }

  if (response.status === 401) {
    return 'Invalid login credentials.';
  }

  if (response.status === 403) {
    return 'Access denied.';
  }

  if (response.status === 422) {
    return 'Please check the information and try again.';
  }

  if (response.status === 429) {
    return 'Too many attempts. Please try again shortly.';
  }

  if (response.status >= 500) {
    return 'Server error. Please try again.';
  }

  return fallback;
}

const LoginCaptcha = forwardRef(function LoginCaptcha(
  {
    language,
    onToken,
    onStatus
  },
  ref
) {
  const box = useRef(null);
  const widget = useRef(null);

  const [config, setConfig] = useState(null);
  const [failed, setFailed] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      reset() {
        if (
          window.hcaptcha &&
          widget.current !== null
        ) {
          try {
            window.hcaptcha.reset(widget.current);
          } catch {}
        }

        onToken?.('');
      }
    }),
    [onToken]
  );

  useEffect(() => {
    let active = true;

    const host = window.location.hostname;

    const configUrl =
      host === '127.0.0.1' ||
      host === 'localhost'
        ? 'https://newsingapurtele.com/api/public/hcaptcha/config?form=admin_login'
        : apiUrl(
            '/public/hcaptcha/config?form=admin_login'
          );

    fetch(configUrl, {
      headers: {
        Accept: 'application/json'
      }
    })
      .then(async (response) => {
        const data = await readJson(response);

        if (active) {
          setConfig(
            data?.data || {
              enabled: false
            }
          );
        }
      })
      .catch(() => {
        if (active) {
          setConfig({
            enabled: false
          });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    onStatus?.(
      config
        ? Boolean(config.enabled)
        : null
    );
  }, [config, onStatus]);

  useEffect(() => {
    if (
      !config?.enabled ||
      !config.site_key ||
      !box.current
    ) {
      return undefined;
    }

    let cancelled = false;

    loadHcaptchaScript()
      .then((hcaptcha) => {
        if (
          cancelled ||
          !box.current
        ) {
          return;
        }

        box.current.innerHTML = '';

        widget.current =
          hcaptcha.render(
            box.current,
            {
              sitekey:
                config.site_key,
              hl: language,
              callback: (token) =>
                onToken?.(token),
              'expired-callback': () =>
                onToken?.(''),
              'error-callback': () =>
                onToken?.('')
            }
          );
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
      widget.current = null;
    };
  }, [
    config,
    language,
    onToken
  ]);

  if (!config?.enabled) {
    return null;
  }

  return (
    <div className="nst-login-captcha">
      <div ref={box} />

      {failed ? (
        <p className="mt-2 text-xs text-red-500">
          hCaptcha could not load. Please refresh and try again.
        </p>
      ) : null}
    </div>
  );
});

export default function Login() {
  const [theme, setTheme] = useState(initialTheme);
  const dark = theme === 'dark';

  const [language, setLanguage] =
    useState(initialLanguage);

  const dictionary =
    language === 'bn'
      ? bnAuth
      : enAuth;

  const t = useCallback(
    (key, params) =>
      translate(
        dictionary,
        key,
        params
      ),
    [dictionary]
  );

  const [email, setEmail] = useState(
    'admin@newsingapurtele.com'
  );

  const [password, setPassword] =
    useState('');

  const [
    twoFactorCode,
    setTwoFactorCode
  ] = useState('');

  const [
    twoFactorRequired,
    setTwoFactorRequired
  ] = useState(false);

  const [
    captchaToken,
    setCaptchaToken
  ] = useState('');

  const [
    captchaEnabled,
    setCaptchaEnabled
  ] = useState(false);

  const [error, setError] =
    useState('');

  const [loading, setLoading] =
    useState(false);

  const [recentAccounts, setRecentAccounts] =
    useState(readRecentAccounts);

  const captcha = useRef(null);

  const [brandLogo, setBrandLogo] =
    useState(() => {
      try {
        return (
          localStorage.getItem(
            'nst_official_logo'
          ) || ''
        );
      } catch {
        return '';
      }
    });

  const onCaptchaStatus =
    useCallback((enabled) => {
      setCaptchaEnabled(
        Boolean(enabled)
      );
    }, []);

  useEffect(() => {
    let active = true;

    const uiSettingsUrl =
      window.location.hostname ===
        '127.0.0.1' ||
      window.location.hostname ===
        'localhost'
        ? 'https://newsingapurtele.com/api/public/system-ui-settings'
        : apiUrl(
            '/public/system-ui-settings'
          );

    fetch(uiSettingsUrl, {
      headers: {
        Accept:
          'application/json'
      }
    })
      .then(readJson)
      .then((payload) => {
        if (!active) return;

        const settings =
          payload?.data ||
          payload ||
          {};

        let brand =
          settings?.ui_brand ||
          {};

        if (
          typeof brand === 'string'
        ) {
          try {
            brand =
              JSON.parse(brand);
          } catch {
            brand = {};
          }
        }

        const logo =
          typeof brand?.logoUrl ===
          'string'
            ? brand.logoUrl.trim()
            : '';

        if (logo) {
          setBrandLogo(logo);

          try {
            localStorage.setItem(
              'nst_official_logo',
              logo
            );
          } catch {}
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const changeLanguage = (
    nextLanguage
  ) => {
    setLanguage(nextLanguage);

    try {
      localStorage.setItem(
        'nst_lang',
        nextLanguage
      );
    } catch {}

    document.documentElement.lang =
      nextLanguage;
  };

  const toggleTheme = () => {
    const next =
      dark
        ? 'light'
        : 'dark';

    setTheme(next);

    try {
      localStorage.setItem(
        'nst_login_theme',
        next
      );
    } catch {}
  };

  const clearRecent = () => {
    setRecentAccounts([]);

    try {
      localStorage.removeItem(
        'nst_recent_staff_logins'
      );
    } catch {}
  };

  const selectRecent = (
    identifier
  ) => {
    setEmail(identifier);
    setPassword('');
  };

  const addAccount = () => {
    setEmail('');
    setPassword('');
    setTwoFactorCode('');
    setError('');
  };

  const handleSubmit =
    async (event) => {
      event.preventDefault();
      setError('');

      if (
        captchaEnabled &&
        !captchaToken
      ) {
        setError(
          t('captcha_required')
        );
        return;
      }

      setLoading(true);

      try {
        const response =
          await fetch(
            apiUrl('/login'),
            {
              method: 'POST',

              headers: {
                Accept:
                  'application/json',

                'Content-Type':
                  'application/json',

                'X-Locale':
                  language
              },

              body: JSON.stringify({
                email,
                password,

                two_factor_code:
                  twoFactorCode ||
                  undefined,

                hcaptcha_token:
                  captchaToken ||
                  undefined
              })
            }
          );

        const data =
          await readJson(response);

        if (!response.ok) {
          if (
            data?.two_factor_required
          ) {
            setTwoFactorRequired(
              true
            );
          }

          throw new Error(
            responseMessage(
              response,
              data,
              'Login failed. Please try again.'
            )
          );
        }

        if (!data?.token) {
          throw new Error(
            'Login token was not returned by the server.'
          );
        }

        localStorage.setItem(
          'nst_admin_token',
          data.token
        );

        saveRecentAccount(email);

        window.location.href =
          '/pos/dashboard';
      } catch (err) {
        setError(
          err?.message ||
            'Login failed. Please try again.'
        );

        captcha.current?.reset();
      } finally {
        setLoading(false);
      }
    };

  const shellClass = dark
    ? 'nst-login-shell nst-login-shell--dark'
    : 'nst-login-shell';

  return (
    <main className={shellClass}>

      <button
        type="button"
        onClick={toggleTheme}
        className="nst-login-theme-toggle"
        aria-label="Toggle theme"
      >
        <span
          className={
            dark
              ? 'nst-theme-icon'
              : 'nst-theme-icon nst-theme-icon--active'
          }
        >
          ☀
        </span>

        <span
          className={
            dark
              ? 'nst-theme-icon nst-theme-icon--active'
              : 'nst-theme-icon'
          }
        >
          ☾
        </span>
      </button>

      <section className="nst-login-layout">

        <aside className="nst-login-intro">

          <div className="nst-login-brand-text">
            <strong>
              NEW SINGAPUR TELECOM
            </strong>

            <span>
              CONNECT · TRADE · GROW
            </span>
          </div>

          <div className="nst-login-copy">

            <p className="nst-login-kicker">
              WELCOME BACK
            </p>

            <h1>
              Sign in to
              <br />
              your account
            </h1>

            <p className="nst-login-subtitle">
              Access your dashboard and continue securely with New Singapur Telecom.
            </p>

          </div>

          <div className="nst-recent-section">

            <div className="nst-recent-header">

              <strong>
                Recent staff logins
              </strong>

              {recentAccounts.length ? (
                <button
                  type="button"
                  onClick={clearRecent}
                >
                  Clear
                </button>
              ) : null}

            </div>

            <div className="nst-recent-grid">

              {recentAccounts.map(
                (identifier) => (
                  <button
                    type="button"
                    key={identifier}
                    onClick={() =>
                      selectRecent(
                        identifier
                      )
                    }
                    className="nst-recent-card"
                  >
                    <span className="nst-recent-avatar">
                      {identifier
                        .charAt(0)
                        .toUpperCase()}
                    </span>

                    <span className="nst-recent-account">
                      {identifier}
                    </span>

                    <small>
                      Staff account
                    </small>
                  </button>
                )
              )}

              <button
                type="button"
                onClick={addAccount}
                className="nst-recent-card nst-recent-card--add"
              >
                <span className="nst-recent-avatar">
                  +
                </span>

                <span className="nst-recent-account">
                  Add account
                </span>

                <small>
                  Use another staff ID
                </small>
              </button>

            </div>

          </div>

        </aside>

        <section className="nst-login-panel">

          <div className="nst-login-card">

            <div className="nst-login-card-top">

              <div className="nst-login-logo-slot">

                {brandLogo ? (
                  <img
                    src={brandLogo}
                    alt="New Singapur Telecom"
                    className="nst-login-logo"
                  />
                ) : (
                  <span className="nst-login-logo-fallback">
                    NST
                  </span>
                )}

              </div>

              <select
                value={language}
                onChange={(event) =>
                  changeLanguage(
                    event.target.value
                  )
                }
                className="nst-login-language"
              >
                <option value="en">
                  English
                </option>

                <option value="bn">
                  বাংলা
                </option>
              </select>

            </div>

            <div className="nst-login-heading">

              <h2>
                New Singapur Telecom
              </h2>

              <p>
                Admin Control Panel
              </p>

            </div>

            {error ? (
              <div
                className="nst-login-error"
                role="alert"
              >
                {error}
              </div>
            ) : null}

            <form
              onSubmit={handleSubmit}
              className="nst-login-form"
            >

              <Field
                label={t('login_id')}
                value={email}
                onChange={setEmail}
                required
                autoComplete="username"
              />

              <Field
                label={t('password')}
                type="password"
                value={password}
                onChange={setPassword}
                required
                autoComplete="current-password"
              />

              {twoFactorRequired ? (
                <Field
                  label={t(
                    'two_factor_code'
                  )}
                  value={twoFactorCode}
                  onChange={
                    setTwoFactorCode
                  }
                  required
                  autoComplete="one-time-code"
                />
              ) : null}

              <LoginCaptcha
                ref={captcha}
                language={language}
                onToken={
                  setCaptchaToken
                }
                onStatus={
                  onCaptchaStatus
                }
              />

              <button
                type="submit"
                disabled={loading}
                className="nst-login-submit"
              >
                {loading
                  ? t('signing_in')
                  : twoFactorRequired
                    ? t(
                        'verify_sign_in'
                      )
                    : t('sign_in')}
              </button>

            </form>

            <p className="nst-login-footer">
              © {new Date().getFullYear()} New Singapur Telecom. All rights reserved.
            </p>

          </div>

        </section>

      </section>

    </main>
  );
}

function Field({
  label,
  type = 'text',
  value,
  onChange,
  required,
  autoComplete
}) {
  return (
    <label className="nst-login-field">

      <span>
        {label}
      </span>

      <input
        type={type}
        required={required}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
      />

    </label>
  );
}
