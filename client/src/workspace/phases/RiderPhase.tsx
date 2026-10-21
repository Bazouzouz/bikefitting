import { useState } from 'react';
import type { Flexibility, Practice, RiderMeasurements } from '../../fit/types';
import { shoeSizeFromFootCm, torsoFromSternum, type DimKey } from '../../fit/measureGuide';
import { useStore } from '../../components/store';
import { RiderSilhouette } from '../../components/RiderSilhouette';
import { MeasureGuide } from '../../components/MeasureGuide';
import { PhasePanel } from '../PhasePanel';

const FIELDS: Array<{ key: DimKey; label: string; unit: string; min: number; max: number; step: number; help: string }> = [
  { key: 'height', label: 'Taille', unit: 'cm', min: 140, max: 210, step: 1, help: 'Debout, sans chaussures.' },
  { key: 'inseam', label: 'Entrejambe', unit: 'cm', min: 60, max: 110, step: 0.5, help: 'Du sol au pubis, livre entre les jambes.' },
  { key: 'shoeSize', label: 'Pointure', unit: 'EU', min: 35, max: 50, step: 0.5, help: 'Pointure européenne.' },
  { key: 'torso', label: 'Torse', unit: 'cm', min: 40, max: 80, step: 0.5, help: 'Du creux sternal au pubis.' },
  { key: 'arm', label: 'Bras', unit: 'cm', min: 45, max: 90, step: 0.5, help: "De l'acromion au poignet." },
  { key: 'shoulderWidth', label: 'Épaules', unit: 'cm', min: 30, max: 55, step: 0.5, help: "D'acromion à acromion." },
];

const FLEX: Array<[Flexibility, string]> = [
  ['low', 'Raide (mains loin des orteils)'],
  ['medium', 'Moyenne (bout des doigts aux orteils)'],
  ['high', 'Souple (paumes au sol)'],
];
const PRACTICE: Array<[Practice, string]> = [
  ['endurance', 'Endurance / confort'],
  ['performance', 'Performance / route sportive'],
  ['gravel', 'Gravel / polyvalent'],
];

const inRange = (r: RiderMeasurements, f: (typeof FIELDS)[number]) => Number.isFinite(r[f.key]) && r[f.key] >= f.min && r[f.key] <= f.max;

/**
 * Phase 2 : morphologie. Le brouillon est appliqué au store dès qu'il est complet et valide, pour que la scène
 * suive les mesures ; une saisie hors bornes reste locale (le store garde toujours une morphologie valide).
 */
export function RiderPhase() {
  const rider = useStore((s) => s.rider);
  const setRider = useStore((s) => s.setRider);
  const [draft, setDraft] = useState<RiderMeasurements>(rider);
  const [active, setActive] = useState<DimKey | null>('height');
  const [footCm, setFootCm] = useState('');
  const [sternumCm, setSternumCm] = useState('');

  const update = (next: RiderMeasurements) => {
    setDraft(next);
    if (FIELDS.every((f) => inRange(next, f))) setRider(next);
  };
  const num = (k: DimKey, v: string) => update({ ...draft, [k]: v === '' ? Number.NaN : Number(v) });

  const shoeFromFoot = shoeSizeFromFootCm(parseFloat(footCm));
  const torsoFromSt = torsoFromSternum(parseFloat(sternumCm), draft.inseam);
  const applyFoot = () => {
    if (Number.isFinite(shoeFromFoot)) update({ ...draft, shoeSize: shoeFromFoot });
  };
  const applySternum = () => {
    if (Number.isFinite(torsoFromSt)) update({ ...draft, torso: torsoFromSt });
  };

  return (
    <PhasePanel phase="rider" title="Ta morphologie">
      <p className="ws-lede">Les mesures s'appliquent au cycliste de la scène dès qu'elles sont valides.</p>
      <div className="ws-fields">
        {FIELDS.map((f) => {
          const bad = !inRange(draft, f);
          return (
            <label key={f.key} className={bad ? 'invalid' : ''}>
              <span>
                {f.label} <small>({f.unit})</small>
              </span>
              <input
                id={`rider-${f.key}`}
                onFocus={() => setActive(f.key)}
                type="number"
                min={f.min}
                max={f.max}
                step={f.step}
                value={Number.isNaN(draft[f.key]) ? '' : draft[f.key]}
                onChange={(e) => num(f.key, e.target.value)}
                aria-invalid={bad || undefined}
                required
              />
              <small className="help">{bad ? `Entre ${f.min} et ${f.max} ${f.unit}.` : f.help}</small>
            </label>
          );
        })}
      </div>

      <div className="ws-fields ws-fields-wide">
        <label>
          Souplesse
          <select value={draft.flexibility} onChange={(e) => update({ ...draft, flexibility: e.target.value as Flexibility })}>
            {FLEX.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Pratique
          <select value={draft.practice} onChange={(e) => update({ ...draft, practice: e.target.value as Practice })}>
            {PRACTICE.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="aids">
        <details>
          <summary>Je ne connais pas ma pointure</summary>
          <div className="aid-row">
            <label>
              <span>
                Longueur du pied <small>(cm)</small>
              </span>
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={footCm}
                onChange={(e) => setFootCm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applyFoot();
                  }
                }}
              />
            </label>
            <button type="button" className="btn small" disabled={!Number.isFinite(shoeFromFoot)} onClick={applyFoot}>
              Utiliser
            </button>
          </div>
          <small className="help">
            {Number.isFinite(shoeFromFoot) ? `≈ pointure ${shoeFromFoot} EU` : "Pied nu sur une feuille, de l'orteil le plus long au talon."}
          </small>
        </details>
        <details>
          <summary>Calculer depuis le creux sternal</summary>
          <div className="aid-row">
            <label>
              <span>
                Sol → creux sternal <small>(cm)</small>
              </span>
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={sternumCm}
                onChange={(e) => setSternumCm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applySternum();
                  }
                }}
              />
            </label>
            <button type="button" className="btn small" disabled={!Number.isFinite(torsoFromSt)} onClick={applySternum}>
              Utiliser
            </button>
          </div>
          <small className="help">
            {Number.isFinite(torsoFromSt)
              ? `Torse ≈ ${torsoFromSt} cm (moins ton entrejambe de ${draft.inseam} cm)`
              : 'Mesure contre le mur, puis on soustrait ton entrejambe.'}
          </small>
        </details>
        <details>
          <summary>Où mesurer ?</summary>
          <RiderSilhouette
            rider={draft}
            active={active}
            onPick={(k) => {
              setActive(k);
              document.getElementById(`rider-${k}`)?.focus();
            }}
          />
        </details>
      </div>

      <MeasureGuide k={active} />
    </PhasePanel>
  );
}
