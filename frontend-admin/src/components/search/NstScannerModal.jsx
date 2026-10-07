import { useEffect, useRef, useState } from 'react';
import { Camera, Flashlight, RefreshCw, ScanLine, X } from 'lucide-react';
import { useT } from '../../i18n';

export default function NstScannerModal({ open, onClose, onScan }) {
  const t = useT();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const frameRef = useRef(0);
  const lastValueRef = useRef('');
  const lastAtRef = useRef(0);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('point');
  const [torch, setTorch] = useState(false);

  const stop = () => {
    cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const loop = async () => {
    if (!open || !videoRef.current || !detectorRef.current) return;
    try {
      if (videoRef.current.readyState >= 2) {
        const codes = await detectorRef.current.detect(videoRef.current);
        const value = String(codes?.[0]?.rawValue || '').trim();
        if (value) {
          const now = Date.now();
          if (value !== lastValueRef.current || now - lastAtRef.current > 1500) {
            lastValueRef.current = value;
            lastAtRef.current = now;
            navigator.vibrate?.(80);
            onScan?.(value);
            return;
          }
        }
      }
    } catch {}
    frameRef.current = requestAnimationFrame(loop);
  };

  const start = async () => {
    setStatus('starting');
    setMessage('starting');
    try {
      if (!('BarcodeDetector' in window)) {
        setStatus('unsupported');
        setMessage('unsupported');
        return;
      }
      const requested = ['qr_code','code_128','code_39','code_93','ean_13','ean_8','upc_a','upc_e','itf','codabar','data_matrix'];
      const supported = typeof window.BarcodeDetector.getSupportedFormats === 'function' ? await window.BarcodeDetector.getSupportedFormats() : requested;
      const formats = requested.filter((format) => supported.includes(format));
      detectorRef.current = new window.BarcodeDetector({ formats: formats.length ? formats : undefined });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus('scanning');
      setMessage('scanning');
      frameRef.current = requestAnimationFrame(loop);
    } catch (error) {
      setStatus('error');
      setMessage(error?.name === 'NotAllowedError' ? 'denied' : 'failed');
    }
  };

  useEffect(() => {
    if (open) start(); else stop();
    return stop;
  }, [open]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    const caps = track?.getCapabilities?.();
    if (!track || !caps?.torch) {
      setMessage('no_torch');
      return;
    }
    const next = !torch;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorch(next);
    } catch {}
  };

  if (!open) return null;
  return <div className="nst-scanner-backdrop" role="dialog" aria-modal="true" aria-label={t('global_search.scanner.dialog')}>
    <div className="nst-scanner-modal">
      <div className="nst-scanner-head"><div><strong><ScanLine size={18}/> {t('global_search.scanner.title')}</strong><span>{t('global_search.scanner.subtitle')}</span></div><button type="button" onClick={onClose} aria-label={t('global_search.scanner.close')}><X size={20}/></button></div>
      <div className="nst-scanner-video-wrap">
        <video ref={videoRef} playsInline muted/>
        <div className="nst-scanner-frame" aria-hidden="true"/>
        {status !== 'scanning' && <div className="nst-scanner-state"><Camera size={34}/><p>{t(`global_search.scanner.${message}`)}</p>{status === 'error' && <button type="button" onClick={start}><RefreshCw size={15}/> {t('global_search.scanner.retry')}</button>}</div>}
      </div>
      <div className="nst-scanner-foot"><span>{t(`global_search.scanner.${message}`)}</span><button type="button" onClick={toggleTorch}><Flashlight size={16}/> {t('global_search.scanner.torch')}</button></div>
    </div>
  </div>;
}
