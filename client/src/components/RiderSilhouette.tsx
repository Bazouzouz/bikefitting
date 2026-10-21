import type { KeyboardEvent, ReactNode } from 'react';
import type { RiderMeasurements } from '../fit/types';
import { footLengthCm, type DimKey } from '../fit/measureGuide';

interface Props {
  rider: RiderMeasurements;
  active: DimKey | null;
  onPick: (k: DimKey) => void;
}

const fmt = (v: number, unit: string) => (Number.isFinite(v) ? `${v} ${unit}` : `– ${unit}`);

/** Demi-corps droit (x ≥ 150) ; la moitié gauche est son miroir. */
const TORSO_LEGS =
  'M150 66 L158 66 L160 84 C176 88 196 92 204 102 C206 112 205 124 203 136 C200 160 198 185 197 205 ' +
  'C197 225 205 240 206 262 C207 300 205 335 199 368 C196 400 194 432 192 464 L197 474 C205 480 208 487 202 491 ' +
  'L156 491 L156 466 C158 430 157 398 155 368 C154 330 152 300 150 268 Z';
const ARM =
  'M200 98 C214 98 222 108 222 122 C223 150 227 178 230 196 C233 225 238 245 241 262 L246 268 ' +
  'C250 282 248 294 240 296 C233 297 230 288 230 276 L226 262 C222 240 216 216 212 196 C210 170 207 148 205 128 Z';
const FOOT =
  'M44 100 C32 92 30 66 42 52 C46 40 50 22 52 0 L106 0 C108 18 110 30 114 40 C140 48 176 52 214 60 ' +
  'C250 66 282 74 290 90 C294 100 288 106 276 106 L214 106 C190 106 176 98 150 98 C120 98 96 106 70 106 L58 106 C50 106 46 104 44 100 Z';

/** Étiquette de cote : pastille sur la ligne, largeur estimée d'après le texte. */
function Pill({ x, y, rotate = 0, children }: { x: number; y: number; rotate?: number; children: string }) {
  const w = children.length * 6.3 + 18;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <rect className="pill" x={-w / 2} y={-11} width={w} height={22} rx={11} />
      <text x={0} y={4} textAnchor="middle">{children}</text>
    </g>
  );
}

export function RiderSilhouette({ rider, active, onPick }: Props) {
  const Dim = ({ k, hit, children }: { k: DimKey; hit: [number, number, number, number]; children: ReactNode }) => (
    <g
      className={`sil-dim${active === k ? ' active' : ''}`}
      onClick={() => onPick(k)}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPick(k);
        }
      }}
      tabIndex={0}
      role="button"
    >
      <rect className="hit" x={hit[0]} y={hit[1]} width={hit[2]} height={hit[3]} />
      {children}
    </g>
  );
  const foot = Number.isFinite(rider.shoeSize) ? footLengthCm(rider.shoeSize) : null;

  return (
    <figure className="rider-figure">
      <svg viewBox="0 0 320 520" role="img" aria-label="Silhouette avec les cotes à mesurer">
        <defs>
          <linearGradient id="sil-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#57554f" />
            <stop offset="1" stopColor="#3a3936" />
          </linearGradient>
        </defs>
        <line className="sil-ground" x1="40" y1="491" x2="280" y2="491" />

        <g className="sil-body">
          <ellipse cx="150" cy="48" rx="19" ry="24" />
          <path d={TORSO_LEGS} />
          <path d={TORSO_LEGS} transform="translate(300 0) scale(-1 1)" />
          <path d={ARM} />
          <path d={ARM} transform="translate(300 0) scale(-1 1)" />
        </g>

        {/* taille : sommet du crâne → sol */}
        <Dim k="height" hit={[268, 24, 40, 467]}>
          <line className="ext" x1="176" y1="24" x2="296" y2="24" />
          <line className="ext" x1="210" y1="491" x2="296" y2="491" />
          <line x1="288" y1="24" x2="288" y2="491" />
          <Pill x={288} y={258} rotate={-90}>{`Taille ${fmt(rider.height, 'cm')}`}</Pill>
        </Dim>

        {/* épaules : acromion → acromion */}
        <Dim k="shoulderWidth" hit={[90, 96, 120, 24]}>
          <line x1="96" y1="108" x2="204" y2="108" />
          <circle cx="96" cy="108" r="3" />
          <circle cx="204" cy="108" r="3" />
          <Pill x={150} y={108}>{`Épaules ${fmt(rider.shoulderWidth, 'cm')}`}</Pill>
        </Dim>

        {/* torse : creux sternal → pubis */}
        <Dim k="torso" hit={[120, 120, 60, 130]}>
          <line x1="150" y1="92" x2="150" y2="266" strokeDasharray="4 4" />
          <circle cx="150" cy="92" r="3" />
          <circle cx="150" cy="266" r="3" />
          <Pill x={150} y={190}>{`Torse ${fmt(rider.torso, 'cm')}`}</Pill>
        </Dim>

        {/* bras : acromion → poignet */}
        <Dim k="arm" hit={[232, 120, 36, 120]}>
          <line x1="232" y1="98" x2="258" y2="262" strokeDasharray="4 4" />
          <circle cx="232" cy="98" r="3" />
          <circle cx="258" cy="262" r="3" />
          <Pill x={245} y={180} rotate={-99}>{`Bras ${fmt(rider.arm, 'cm')}`}</Pill>
        </Dim>

        {/* entrejambe : sol → pubis */}
        <Dim k="inseam" hit={[24, 266, 36, 225]}>
          <line className="ext" x1="40" y1="266" x2="150" y2="266" />
          <line x1="40" y1="266" x2="40" y2="491" />
          <circle cx="40" cy="266" r="3" />
          <Pill x={40} y={378} rotate={-90}>{`Entrejambe ${fmt(rider.inseam, 'cm')}`}</Pill>
        </Dim>
      </svg>

      <svg viewBox="0 0 320 150" role="img" aria-label="Pied et pointure" className="rider-foot">
        <g className="sil-body">
          <path d={FOOT} />
          <path className="toes" d="M258 68 C270 76 278 86 282 98 M240 62 C254 72 262 84 266 98" />
        </g>
        <Dim k="shoeSize" hit={[30, 112, 270, 34]}>
          <line className="ext" x1="34" y1="106" x2="34" y2="132" />
          <line className="ext" x1="290" y1="106" x2="290" y2="132" />
          <line x1="34" y1="126" x2="290" y2="126" />
          <Pill x={162} y={126}>{`Pointure ${fmt(rider.shoeSize, 'EU')}${foot !== null ? ` · pied ≈ ${foot} cm` : ''}`}</Pill>
        </Dim>
      </svg>
    </figure>
  );
}
