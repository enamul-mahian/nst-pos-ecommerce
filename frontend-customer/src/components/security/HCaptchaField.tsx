import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import apiClient from '../../api/client';
import { useI18n } from '../../i18n';

type CaptchaForm = 'customer_login' | 'customer_registration' | 'checkout_registration' | 'supplier_login';
interface HCaptchaApi {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id?: string) => void;
}
declare global { interface Window { hcaptcha?: HCaptchaApi } }

export interface HCaptchaHandle { reset: () => void }
interface Props { form: CaptchaForm; onToken: (token: string) => void; onStatus?: (enabled: boolean | null) => void; dark?: boolean }

let scriptPromise: Promise<HCaptchaApi> | null = null;
function loadScript(): Promise<HCaptchaApi> {
  if (window.hcaptcha) return Promise.resolve(window.hcaptcha);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://js.hcaptcha.com/1/api.js?render=explicit&recaptchacompat=off';
    script.async = true;
    script.defer = true;
    script.onload = () => (window.hcaptcha ? resolve(window.hcaptcha) : reject(new Error('hCaptcha unavailable')));
    script.onerror = () => { scriptPromise = null; reject(new Error('hCaptcha script failed to load')); };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** Shows the hCaptcha box when Security Center has it switched on for this form. */
export const HCaptchaField = forwardRef<HCaptchaHandle, Props>(({ form, onToken, onStatus, dark = false }, ref) => {
  const { language, t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [config, setConfig] = useState<{ enabled: boolean; site_key?: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useImperativeHandle(ref, () => ({
    reset() { if (window.hcaptcha && widget.current !== null) window.hcaptcha.reset(widget.current); onToken(''); },
  }), [onToken]);

  useEffect(() => {
    let active = true;
    apiClient.get('/public/hcaptcha/config', { params: { form } })
      .then((response) => { if (active) setConfig(response?.data?.data || { enabled: false }); })
      .catch(() => { if (active) setConfig({ enabled: false }); });
    return () => { active = false; };
  }, [form]);

  useEffect(() => { onStatus?.(config ? Boolean(config.enabled) : null); }, [config, onStatus]);

  useEffect(() => {
    if (!config?.enabled || !config.site_key || !box.current) return undefined;
    let cancelled = false;
    loadScript().then((hcaptcha) => {
      if (cancelled || !box.current) return;
      box.current.innerHTML = '';
      widget.current = hcaptcha.render(box.current, {
        sitekey: config.site_key,
        hl: language,
        theme: dark ? 'dark' : 'light',
        callback: (token: string) => onToken(token),
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
      });
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; widget.current = null; };
  }, [config, language, onToken, dark]);

  if (!config?.enabled) return null;
  return (
    <div className="flex flex-col items-center">
      <div ref={box} />
      {failed ? <p className="mt-1 text-xs text-red-500">{t('auth.captcha_load_failed')}</p> : null}
    </div>
  );
});

HCaptchaField.displayName = 'HCaptchaField';
export default HCaptchaField;
