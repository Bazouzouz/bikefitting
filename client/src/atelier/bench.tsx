/**
 * Banc d'essai autonome de la vue éclatée (client/bench-exploded.html, servi par `npm run dev -w client`).
 * Paramètres d'URL optionnels pour les captures : ?step=height|setback|tilt&open=1&sta=73&variant=one-bolt
 */
import { StrictMode, useState, type JSX } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import '../styles/ui.css';
import { SaddleExploded } from './SaddleExploded';
import type { ClampVariant, SaddleStep } from './saddleParts';

const q = new URLSearchParams(window.location.search);
const STEPS: SaddleStep[] = ['height', 'setback', 'tilt'];
const STEP_LABEL: Record<SaddleStep, string> = { height: 'Hauteur', setback: 'Recul', tilt: 'Inclinaison' };

function Bench(): JSX.Element {
  const [step, setStep] = useState<SaddleStep>(STEPS.find((s) => s === q.get('step')) ?? 'height');
  const [open, setOpen] = useState(q.get('open') === '1');
  const [sta, setSta] = useState(Number(q.get('sta')) || 73);
  const [variant, setVariant] = useState<ClampVariant>(q.get('variant') === 'one-bolt' ? 'one-bolt' : 'two-bolt');

  return (
    <main style={{ padding: 'var(--gutter)', display: 'grid', gap: 16, maxWidth: 600, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.75rem', margin: 0 }}>Banc · tige de selle éclatée</h1>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {STEPS.map((s) => (
          <button key={s} type="button" className="xp-btn" aria-pressed={step === s} onClick={() => setStep(s)} style={step === s ? { borderColor: 'var(--accent)' } : undefined}>
            {STEP_LABEL[s]}
          </button>
        ))}
        <button type="button" className="xp-btn" aria-pressed={open} onClick={() => setOpen((o) => !o)}>
          {open ? "Fermer l'éclaté" : 'Vue éclatée'}
        </button>
        <button type="button" className="xp-btn" onClick={() => setVariant((v) => (v === 'two-bolt' ? 'one-bolt' : 'two-bolt'))}>
          {variant === 'two-bolt' ? '2 vis' : '1 vis'}
        </button>
      </div>
      <div className="field">
        <label htmlFor="sta">Angle du tube de selle : {sta}°</label>
        <input id="sta" type="range" min={68} max={78} step={0.5} value={sta} onChange={(e) => setSta(Number(e.target.value))} />
      </div>
      <SaddleExploded step={step} staDeg={sta} open={open} variant={variant} />
    </main>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('Élément #root introuvable');
document.body.style.background = 'var(--bg)';
document.body.style.color = 'var(--ink)';
document.body.style.fontFamily = 'var(--f-body)';
document.body.style.margin = '0';

createRoot(container).render(
  <StrictMode>
    <Bench />
  </StrictMode>,
);
