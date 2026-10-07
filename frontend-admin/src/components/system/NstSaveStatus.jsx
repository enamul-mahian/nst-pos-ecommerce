import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';

const LABELS = {
  save: ['Saving…', 'Saved'],
  publish: ['Publishing…', 'Published'],
  delete: ['Deleting…', 'Deleted'],
};

/** App-wide save indicator driven by real API responses (see NST_SAVE_FEEDBACK in services/api.js). */
export default function NstSaveStatus() {
  const pending = useRef(new Map());
  const timer = useRef(null);
  const [state, setState] = useState(null);

  useEffect(() => {
    const onStatus = (event) => {
      const { id, phase, kind = 'save', message = '' } = event.detail || {};
      clearTimeout(timer.current);
      if (phase === 'start') {
        pending.current.set(id, kind);
        setState({ phase: 'saving', kind });
        return;
      }
      const startedKind = pending.current.get(id) || kind;
      pending.current.delete(id);
      if (phase === 'error') {
        setState({ phase: 'error', kind: startedKind, message });
        timer.current = setTimeout(() => setState(null), 9000);
        return;
      }
      if (pending.current.size > 0) {
        setState({ phase: 'saving', kind: [...pending.current.values()].pop() });
        return;
      }
      setState({ phase: 'saved', kind: startedKind, message });
      timer.current = setTimeout(() => setState(null), 2400);
    };
    window.addEventListener('nst-save-status', onStatus);
    return () => { window.removeEventListener('nst-save-status', onStatus); clearTimeout(timer.current); };
  }, []);

  if (!state) return null;
  const [busyLabel, doneLabel] = LABELS[state.kind] || LABELS.save;

  return (
    <div className={`nst-save-status is-${state.phase}`} role={state.phase === 'error' ? 'alert' : 'status'} aria-live="polite">
      {state.phase === 'saving' && <><Loader2 size={16} className="nst-save-status-spin" />{busyLabel}</>}
      {state.phase === 'saved' && <><CheckCircle2 size={16} />{doneLabel}</>}
      {state.phase === 'error' && <>
        <AlertCircle size={16} />
        <span className="nst-save-status-text"><b>Not saved.</b> {state.message}</span>
        <button type="button" onClick={() => setState(null)} aria-label="Dismiss"><X size={14} /></button>
      </>}
    </div>
  );
}
