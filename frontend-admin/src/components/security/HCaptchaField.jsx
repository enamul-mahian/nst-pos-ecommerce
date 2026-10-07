import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import api from '../../services/api';
import { useI18n } from '../../i18n';

const SCRIPT_ID = 'hcaptcha-api-script';
let scriptPromise = null;

function loadScript() {
  if (window.hcaptcha) return Promise.resolve(window.hcaptcha);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = 'https://js.hcaptcha.com/1/api.js?render=explicit&recaptchacompat=off';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.hcaptcha);
    script.onerror = () => { scriptPromise = null; reject(new Error('hCaptcha script failed to load')); };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Shows the hCaptcha box when it is switched on for this form in Security Center.
 * onToken receives the token ('' when it expires). ref.reset() clears it after a failed submit.
 */
const HCaptchaField = forwardRef(function HCaptchaField({ form, onToken, onStatus }, ref) {
  const { language, t } = useI18n();
  const box = useRef(null);
  const widget = useRef(null);
  const [config, setConfig] = useState(null);
  const [failed, setFailed] = useState(false);

  useImperativeHandle(ref, () => ({
    reset() { if (window.hcaptcha && widget.current !== null) window.hcaptcha.reset(widget.current); onToken?.(''); },
  }), [onToken]);

  useEffect(() => {
    let active = true;
    api.get('/public/hcaptcha/config', { params: { form } })
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
        callback: (token) => onToken?.(token),
        'expired-callback': () => onToken?.(''),
        'error-callback': () => onToken?.(''),
      });
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; widget.current = null; };
  }, [config, language, onToken]);

  if (!config?.enabled) return null;
  return (
    <div className="nst-hcaptcha">
      <div ref={box}/>
      {failed ? <p className="mt-1 text-xs text-red-600">{t('auth.captcha_load_failed')}</p> : null}
    </div>
  );
});

export default HCaptchaField;
