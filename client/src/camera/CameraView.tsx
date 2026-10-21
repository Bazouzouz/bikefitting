import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import type { BikeSize } from '@bikefit/shared';
import type { FitResult } from '../fit/types';
import { createDetector, markerBits, type DetectedMarker, type MarkerDetector } from './aruco';
import {
  calibrationFromMarkers,
  calibrationFromTwoPoints,
  guessForwardSign,
  markerCenter,
  pxToWorld,
  saddleError,
  saddleNoseFromMarker,
  type Calibration,
  type ForwardSign,
  type ReferenceAxis,
  type Vec2,
} from './geometry';
import {
  classify,
  emaAlpha,
  emaVec,
  foreMessage,
  heightMessage,
  smoothCalibration,
  stateColor,
  type AdjustState,
} from './status';
import { frontScaleFromBar, kneeAlignment, shoulderVsBar, symmetry, type FrontScale } from './front';
import { drawFramingGuide, drawMarkerOutline, drawPoint, drawProfileGhost, drawLabel } from './ghost';
import { DEFAULT_MARKER_SIZE_MM, MARKER_IDS, markerPageSvg, quietZoneMm } from './markers';
import { useCamera } from './useCamera';

export interface CameraViewProps {
  fit: FitResult;
  bike: BikeSize;
}

type View = 'profile' | 'front' | 'markers';
type CalibMode = 'markers' | 'manual';
type ForwardChoice = 'auto' | 'right' | 'left';

type ManualKey = 'ref1' | 'ref2' | 'bb' | 'nose';
const MANUAL_STEPS: { key: ManualKey; label: string }[] = [
  { key: 'ref1', label: 'Clique le 1er point de la longueur de référence (ex. axe de roue arrière)' },
  { key: 'ref2', label: 'Clique le 2e point de la référence (ex. axe de roue avant)' },
  { key: 'bb', label: "Clique l'axe de pédalier" },
  { key: 'nose', label: 'Clique la pointe (bec) de la selle' },
];

type FrontKey = 'barL' | 'barR' | 'shL' | 'shR' | 'kneeL' | 'footL' | 'kneeR' | 'footR';
const FRONT_STEPS: { key: FrontKey; label: string; short: string }[] = [
  { key: 'barL', label: "Clique l'extrémité du cintre à GAUCHE de l'image", short: 'Cintre G' },
  { key: 'barR', label: "Clique l'extrémité du cintre à DROITE de l'image", short: 'Cintre D' },
  { key: 'shL', label: "Clique l'épaule (acromion) à gauche de l'image", short: 'Épaule G' },
  { key: 'shR', label: "Clique l'épaule (acromion) à droite de l'image", short: 'Épaule D' },
  { key: 'kneeL', label: "Pédale gauche de l'image en bas : clique le centre du genou", short: 'Genou G' },
  { key: 'footL', label: 'Clique le centre de la chaussure (au niveau de la cale), même côté', short: 'Cale G' },
  { key: 'kneeR', label: "Pédale droite de l'image en bas : clique le centre du genou", short: 'Genou D' },
  { key: 'footR', label: 'Clique le centre de la chaussure (au niveau de la cale), même côté', short: 'Cale D' },
];

interface Readout {
  status: string;
  lines: { text: string; color: string }[];
}

const DETECT_INTERVAL_MS = 90;
const DETECT_MAX_WIDTH = 1280;
const MARKER_LOST_MS = 700;
const SMOOTH_TAU_MS = 250;

export function CameraView({ fit, bike }: CameraViewProps) {
  const cam = useCamera();
  const [view, setView] = useState<View>('profile');

  // --- réglages profil
  const [calibMode, setCalibMode] = useState<CalibMode>('markers');
  const [markerSizeMm, setMarkerSizeMm] = useState(DEFAULT_MARKER_SIZE_MM);
  const [assumeLevel, setAssumeLevel] = useState(true);
  const [forward, setForward] = useState<ForwardChoice>('auto');
  const [noseOffsetMm, setNoseOffsetMm] = useState(() => quietZoneMm(DEFAULT_MARKER_SIZE_MM));
  // le décalage par défaut suit la marge blanche imprimée
  useEffect(() => setNoseOffsetMm(quietZoneMm(markerSizeMm)), [markerSizeMm]);
  const [frozen, setFrozen] = useState(false);
  const [refDistance, setRefDistance] = useState<number>(bike.wheelbase ?? 0);
  const [refAxis, setRefAxis] = useState<ReferenceAxis>(bike.wheelbase ? 'horizontal' : 'none');
  const [manual, setManual] = useState<Partial<Record<ManualKey, Vec2>>>({});

  // --- réglages face
  const [barWidthMm, setBarWidthMm] = useState(bike.handlebarWidth);
  const [front, setFront] = useState<Partial<Record<FrontKey, Vec2>>>({});

  const [detectorError, setDetectorError] = useState<string | null>(null);
  const [readout, setReadout] = useState<Readout>({ status: '', lines: [] });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- calculs statiques
  const manualStep = MANUAL_STEPS.find((s) => !manual[s.key]) ?? null;
  const frontStep = FRONT_STEPS.find((s) => !front[s.key]) ?? null;

  const manualCal = useMemo<Calibration | null>(() => {
    if (!manual.ref1 || !manual.ref2 || !manual.bb || !(refDistance > 0)) return null;
    const sign: ForwardSign =
      forward === 'left' ? -1 : forward === 'right' ? 1 : manual.nose ? (guessForwardSign(manual.bb, manual.nose) ?? 1) : 1;
    try {
      return calibrationFromTwoPoints({
        p1: manual.ref1,
        p2: manual.ref2,
        distanceMm: refDistance,
        axis: refAxis,
        bbPx: manual.bb,
        forwardSign: sign,
      });
    } catch {
      return null;
    }
  }, [manual, refDistance, refAxis, forward]);

  const frontScale = useMemo<FrontScale | null>(() => {
    if (!front.barL || !front.barR || !(barWidthMm > 0)) return null;
    try {
      return frontScaleFromBar(front.barL, front.barR, barWidthMm);
    } catch {
      return null;
    }
  }, [front.barL, front.barR, barWidthMm]);

  const frontResults = useMemo(() => {
    if (!frontScale) return [];
    const out: { text: string; color: string }[] = [];
    if (front.shL && front.shR) {
      const s = shoulderVsBar(frontScale, front.shL, front.shR, fit.handlebarWidth.value);
      out.push({ text: s.message, color: stateColor(s.state) });
      const sym = symmetry(frontScale, front.shL, front.shR, 'Épaules');
      out.push({ text: sym.message, color: stateColor(sym.state) });
    }
    if (front.kneeL && front.footL) {
      const k = kneeAlignment(frontScale, front.kneeL, front.footL, 'imageLeft');
      out.push({ text: `Gauche image : ${k.message}`, color: stateColor(k.state) });
    }
    if (front.kneeR && front.footR) {
      const k = kneeAlignment(frontScale, front.kneeR, front.footR, 'imageRight');
      out.push({ text: `Droite image : ${k.message}`, color: stateColor(k.state) });
    }
    if (front.kneeL && front.kneeR) {
      const sym = symmetry(frontScale, front.kneeL, front.kneeR, 'Genoux');
      out.push({ text: sym.message, color: stateColor(sym.state) });
    }
    return out;
  }, [frontScale, front, fit.handlebarWidth.value]);

  // --- état vivant pour la boucle d'animation (évite de la relancer à chaque rendu)
  const live = useRef({
    view,
    calibMode,
    markerSizeMm,
    assumeLevel,
    forward,
    noseOffsetMm,
    manual,
    manualCal,
    front,
    frontResults,
    fit,
    bike,
  });
  live.current = {
    view,
    calibMode,
    markerSizeMm,
    assumeLevel,
    forward,
    noseOffsetMm,
    manual,
    manualCal,
    front,
    frontResults,
    fit,
    bike,
  };

  // --- flux vidéo
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // la <video> est démontée sur l'onglet « Marqueurs » : on rebranche le flux au retour
    if (v.srcObject !== cam.stream) v.srcObject = cam.stream;
    if (cam.stream) void v.play().catch(() => undefined);
    setFrozen(false);
  }, [cam.stream, view]);

  const toggleFreeze = () => {
    const v = videoRef.current;
    if (!v || !cam.stream) return;
    if (frozen) void v.play().catch(() => undefined);
    else v.pause();
    setFrozen(!frozen);
  };

  // --- détecteur (chargé à la demande)
  const detectorRef = useRef<MarkerDetector | null>(null);
  useEffect(() => {
    if (calibMode !== 'markers' || detectorRef.current) return;
    let cancelled = false;
    createDetector()
      .then((d) => {
        if (!cancelled) detectorRef.current = d;
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setDetectorError(`Détection des marqueurs indisponible (${e instanceof Error ? e.message : String(e)}). Utilise la calibration manuelle.`);
          setCalibMode('manual');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [calibMode]);

  // --- boucle : détection + dessin
  useEffect(() => {
    if (!cam.stream) return;
    let raf = 0;
    const work = document.createElement('canvas');
    const wctx = work.getContext('2d', { willReadFrequently: true });
    let lastDetect = 0;
    let lastFrame = performance.now();
    let lastReadout = 0;
    let seen: { bb: DetectedMarker | null; saddle: DetectedMarker | null; bbAt: number; saddleAt: number } = {
      bb: null,
      saddle: null,
      bbAt: 0,
      saddleAt: 0,
    };
    let smoothCal: Calibration | null = null;
    let smoothNose: Vec2 | null = null;
    let lastSign: ForwardSign = 1;
    let hState: AdjustState | null = null;
    let fState: AdjustState | null = null;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2 || !video.videoWidth) return;
      const L = live.current;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (canvas.width !== vw || canvas.height !== vh) {
        canvas.width = vw;
        canvas.height = vh;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dt = now - lastFrame;
      lastFrame = now;
      const alpha = emaAlpha(dt, SMOOTH_TAU_MS);
      ctx.clearRect(0, 0, vw, vh);

      if (L.view === 'front') {
        drawFramingGuide(ctx, 'front');
        drawFront(ctx, L.front, L.frontResults);
        return;
      }
      if (L.view !== 'profile') return;
      drawFramingGuide(ctx, 'profile');

      let cal: Calibration | null = null;
      let nose: Vec2 | null = null;
      let status = '';

      if (L.calibMode === 'markers') {
        const det = detectorRef.current;
        if (det && wctx && now - lastDetect >= DETECT_INTERVAL_MS) {
          lastDetect = now;
          const k = Math.min(1, DETECT_MAX_WIDTH / vw);
          work.width = Math.round(vw * k);
          work.height = Math.round(vh * k);
          wctx.drawImage(video, 0, 0, work.width, work.height);
          const img = wctx.getImageData(0, 0, work.width, work.height);
          const found = det.detect(img).map((m) => ({
            id: m.id,
            corners: m.corners.map((c) => ({ x: c.x / k, y: c.y / k })) as DetectedMarker['corners'],
          }));
          const bb = found.find((m) => m.id === MARKER_IDS.bb);
          const sd = found.find((m) => m.id === MARKER_IDS.saddle);
          if (bb) seen = { ...seen, bb, bbAt: now };
          if (sd) seen = { ...seen, saddle: sd, saddleAt: now };
        }
        const bbOk = seen.bb && now - seen.bbAt < MARKER_LOST_MS;
        const sdOk = seen.saddle && now - seen.saddleAt < MARKER_LOST_MS;
        if (bbOk && seen.bb) drawMarkerOutline(ctx, seen.bb.corners, '#22d3ee', 'BB');
        if (sdOk && seen.saddle) drawMarkerOutline(ctx, seen.saddle.corners, '#22d3ee', 'Selle');

        if (bbOk && seen.bb) {
          let sign: ForwardSign = L.forward === 'left' ? -1 : 1;
          if (L.forward === 'auto') {
            if (sdOk && seen.saddle) {
              sign = guessForwardSign(markerCenter(seen.bb.corners), markerCenter(seen.saddle.corners)) ?? lastSign;
            } else sign = lastSign;
          }
          lastSign = sign;
          const raw = calibrationFromMarkers({
            bb: seen.bb.corners,
            saddle: sdOk && seen.saddle ? seen.saddle.corners : undefined,
            markerSizeMm: L.markerSizeMm,
            assumeLevel: L.assumeLevel,
            forwardSign: sign,
          });
          smoothCal = smoothCalibration(smoothCal, raw, alpha);
          cal = smoothCal;
          if (sdOk && seen.saddle) {
            const n = saddleNoseFromMarker(cal, seen.saddle.corners, L.markerSizeMm, L.noseOffsetMm);
            smoothNose = emaVec(smoothNose, n, alpha);
            nose = smoothNose;
            status = 'Marqueurs BB et selle détectés';
          } else {
            smoothNose = null;
            status = 'Marqueur de selle non vu : place-le sous le bec de selle';
          }
        } else {
          smoothCal = null;
          smoothNose = null;
          status = detectorRef.current
            ? "Marqueur d'axe de pédalier non vu : place le vélo de profil, marqueurs face caméra"
            : 'Chargement du détecteur…';
        }
      } else {
        cal = L.manualCal;
        nose = cal && L.manual.nose ? pxToWorld(cal, L.manual.nose) : null;
        const step = MANUAL_STEPS.find((s) => !L.manual[s.key]);
        status = step ? step.label : 'Calibration manuelle OK — repointe le bec après chaque réglage';
        for (const s of MANUAL_STEPS) {
          const p = L.manual[s.key];
          if (p) drawPoint(ctx, p, s.key === 'nose' ? '#fff' : '#22d3ee', s.key === 'bb' ? 'BB' : undefined);
        }
        if (L.manual.ref1 && L.manual.ref2) {
          ctx.strokeStyle = '#22d3ee';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(L.manual.ref1.x, L.manual.ref1.y);
          ctx.lineTo(L.manual.ref2.x, L.manual.ref2.y);
          ctx.stroke();
        }
      }

      const lines: { text: string; color: string }[] = [];
      if (cal) {
        let color = '#3b82f6';
        if (nose) {
          const e = saddleError(nose, L.fit.saddlePosition, L.bike.seatTubeAngle);
          hState = classify(e.height, L.fit.tolerances.saddleHeight, hState);
          fState = classify(e.fore, L.fit.tolerances.saddleSetback, fState);
          const worst: AdjustState =
            hState === 'far' || fState === 'far' ? 'far' : hState === 'near' || fState === 'near' ? 'near' : 'ok';
          color = stateColor(worst);
          lines.push({ text: heightMessage(e.height, hState), color: stateColor(hState) });
          lines.push({ text: foreMessage(e.fore, fState), color: stateColor(fState) });
        } else {
          hState = fState = null;
        }
        drawProfileGhost(ctx, {
          cal,
          saddleTarget: L.fit.saddlePosition,
          saddleCurrent: nose,
          saddleColor: color,
          hands: L.fit.hands,
          seatTubeAngleDeg: L.bike.seatTubeAngle,
          targetSaddleHeight: L.fit.saddleHeight.value,
          messages: lines,
        });
      } else {
        drawLabel(ctx, status, { x: 16, y: 40 }, '#fff', Math.max(16, Math.round(vw / 55)));
      }

      if (now - lastReadout > 250) {
        lastReadout = now;
        setReadout((prev) =>
          prev.status === status && JSON.stringify(prev.lines) === JSON.stringify(lines) ? prev : { status, lines },
        );
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [cam.stream]);

  // --- clics sur l'image
  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current;
    if (!c || !c.width) return;
    const r = c.getBoundingClientRect();
    const p = { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
    if (view === 'profile' && calibMode === 'manual') {
      const step = MANUAL_STEPS.find((s) => !manual[s.key]);
      // une fois calibré, chaque clic repointe le bec de selle
      setManual({ ...manual, [step ? step.key : 'nose']: p });
    } else if (view === 'front') {
      const step = FRONT_STEPS.find((s) => !front[s.key]);
      if (step) setFront({ ...front, [step.key]: p });
    }
  };

  const instruction =
    view === 'profile'
      ? 'Place le vélo de PROFIL : caméra de niveau, à hauteur du boîtier de pédalier, à 2–3 m, vélo entier dans le cadre pointillé.'
      : view === 'front'
        ? 'Place-toi de FACE, sur le vélo, mains aux cocottes : caméra centrée sur l’axe du vélo, à hauteur du guidon, tout le corps visible.'
        : '';

  return (
    <section style={{ display: 'grid', gap: 12, maxWidth: 1100 }}>
      <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <TabButton active={view === 'profile'} onClick={() => setView('profile')}>
          1. Vélo de profil
        </TabButton>
        <TabButton active={view === 'front'} onClick={() => setView('front')}>
          2. Cycliste de face
        </TabButton>
        <TabButton active={view === 'markers'} onClick={() => setView('markers')}>
          Marqueurs à imprimer
        </TabButton>
      </nav>

      {view === 'markers' ? (
        <MarkerSheet sizeMm={markerSizeMm} setSizeMm={setMarkerSizeMm} />
      ) : (
        <>
          <p style={banner}>{instruction}</p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {cam.stream ? (
              <button onClick={cam.stop}>Arrêter la caméra</button>
            ) : (
              <button onClick={cam.start} disabled={cam.starting}>
                {cam.starting ? 'Ouverture…' : 'Démarrer la caméra'}
              </button>
            )}
            {cam.stream && (
              <button onClick={toggleFreeze}>{frozen ? 'Reprendre la vidéo' : "Figer l'image (pour cliquer)"}</button>
            )}
            <label>
              Caméra{' '}
              <select value={cam.deviceId ?? ''} onChange={(e) => cam.setDeviceId(e.target.value || null)}>
                <option value="">Par défaut (arrière sur téléphone)</option>
                {cam.devices.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `Caméra ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {cam.error && <p style={errorBox}>{cam.error}</p>}
          {detectorError && <p style={errorBox}>{detectorError}</p>}

          <div style={{ position: 'relative', background: '#111', borderRadius: 8, overflow: 'hidden', minHeight: 200 }}>
            <video ref={videoRef} playsInline muted autoPlay style={{ display: 'block', width: '100%' }} />
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                cursor: view === 'front' || calibMode === 'manual' ? 'crosshair' : 'default',
                touchAction: 'none',
              }}
            />
            {!cam.stream && (
              <p style={{ position: 'absolute', inset: 0, margin: 0, display: 'grid', placeItems: 'center', color: '#bbb' }}>
                Caméra arrêtée
              </p>
            )}
          </div>

          {view === 'profile' ? (
            <ProfilePanel
              {...{
                calibMode,
                setCalibMode,
                markerSizeMm,
                setMarkerSizeMm,
                assumeLevel,
                setAssumeLevel,
                forward,
                setForward,
                noseOffsetMm,
                setNoseOffsetMm,
                refDistance,
                setRefDistance,
                refAxis,
                setRefAxis,
                manualStep: manualStep?.label ?? null,
                resetManual: () => setManual({}),
                repointNose: () => setManual(({ nose: _n, ...rest }) => rest),
                readout,
                fit,
              }}
            />
          ) : (
            <section style={panel}>
              <p style={{ margin: 0, fontWeight: 600 }}>{frontStep ? frontStep.label : 'Mesures de face terminées'}</p>
              <label>
                Largeur du cintre monté (mm, axe à axe des extrémités cliquées){' '}
                <input type="number" value={barWidthMm} onChange={(e) => setBarWidthMm(Number(e.target.value))} style={{ width: 80 }} />
              </label>
              <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
                Cintre recommandé : {Math.round(fit.handlebarWidth.value)} mm. L’échelle de face vient du cintre : épaules et genoux
                sont supposés à la même distance de la caméra.
              </p>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {frontResults.map((r) => (
                  <li key={r.text} style={{ color: r.color, fontWeight: 600 }}>
                    {r.text}
                  </li>
                ))}
              </ul>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setFront({})}>Recommencer les points</button>
                <button
                  onClick={() => {
                    const keys = FRONT_STEPS.map((s) => s.key).filter((k) => front[k]);
                    const last = keys[keys.length - 1];
                    if (last) setFront(({ [last]: _x, ...rest }) => rest);
                  }}
                >
                  Annuler le dernier point
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </section>
  );
}

function drawFront(
  ctx: CanvasRenderingContext2D,
  pts: Partial<Record<FrontKey, Vec2>>,
  results: { text: string; color: string }[],
) {
  const pairs: [FrontKey, FrontKey][] = [
    ['barL', 'barR'],
    ['shL', 'shR'],
    ['kneeL', 'footL'],
    ['kneeR', 'footR'],
  ];
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 3;
  for (const [a, b] of pairs) {
    const pa = pts[a];
    const pb = pts[b];
    if (pa && pb) {
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
  }
  for (const s of FRONT_STEPS) {
    const p = pts[s.key];
    if (p) drawPoint(ctx, p, '#22d3ee', s.short);
  }
  const font = Math.max(16, Math.round(ctx.canvas.width / 50));
  let y = font * 1.6;
  for (const r of results) {
    drawLabel(ctx, r.text, { x: font * 0.8, y }, r.color, font);
    y += font * 1.6;
  }
}

interface ProfilePanelProps {
  calibMode: CalibMode;
  setCalibMode: (m: CalibMode) => void;
  markerSizeMm: number;
  setMarkerSizeMm: (n: number) => void;
  assumeLevel: boolean;
  setAssumeLevel: (b: boolean) => void;
  forward: ForwardChoice;
  setForward: (f: ForwardChoice) => void;
  noseOffsetMm: number;
  setNoseOffsetMm: (n: number) => void;
  refDistance: number;
  setRefDistance: (n: number) => void;
  refAxis: ReferenceAxis;
  setRefAxis: (a: ReferenceAxis) => void;
  manualStep: string | null;
  resetManual: () => void;
  repointNose: () => void;
  readout: Readout;
  fit: FitResult;
}

function ProfilePanel(p: ProfilePanelProps) {
  return (
    <section style={panel}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <label>
          <input type="radio" checked={p.calibMode === 'markers'} onChange={() => p.setCalibMode('markers')} /> Marqueurs ArUco
        </label>
        <label>
          <input type="radio" checked={p.calibMode === 'manual'} onChange={() => p.setCalibMode('manual')} /> Manuel (2 points +
          distance)
        </label>
      </div>

      <p style={{ margin: 0, fontWeight: 600 }}>{p.readout.status}</p>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {p.readout.lines.map((l) => (
          <li key={l.text} style={{ color: l.color, fontWeight: 700, fontSize: 18 }}>
            {l.text}
          </li>
        ))}
      </ul>
      <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
        Cible bec de selle : x = {Math.round(p.fit.saddlePosition.x)} mm, y = {Math.round(p.fit.saddlePosition.y)} mm
        (tolérances ±{p.fit.tolerances.saddleHeight} mm hauteur, ±{p.fit.tolerances.saddleSetback} mm recul).
      </p>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {p.calibMode === 'markers' ? (
          <>
            <label>
              Côté du carré noir imprimé (mm){' '}
              <input
                type="number"
                value={p.markerSizeMm}
                onChange={(e) => p.setMarkerSizeMm(Number(e.target.value) || DEFAULT_MARKER_SIZE_MM)}
                style={{ width: 70 }}
              />
            </label>
            <label>
              Décalage marqueur → bec (mm){' '}
              <input type="number" value={p.noseOffsetMm} onChange={(e) => p.setNoseOffsetMm(Number(e.target.value))} style={{ width: 60 }} />
            </label>
          </>
        ) : (
          <>
            <label>
              Longueur de référence (mm){' '}
              <input type="number" value={p.refDistance || ''} onChange={(e) => p.setRefDistance(Number(e.target.value))} style={{ width: 80 }} />
            </label>
            <label>
              Référence{' '}
              <select value={p.refAxis} onChange={(e) => p.setRefAxis(e.target.value as ReferenceAxis)}>
                <option value="horizontal">horizontale (empattement, axes de roue)</option>
                <option value="vertical">verticale (diamètre de roue haut/bas)</option>
                <option value="none">quelconque (caméra de niveau)</option>
              </select>
            </label>
            <button onClick={p.resetManual}>Recommencer</button>
            {!p.manualStep && <button onClick={p.repointNose}>Repointer le bec</button>}
          </>
        )}
        {p.calibMode === 'markers' && (
          <label>
            <input type="checkbox" checked={p.assumeLevel} onChange={(e) => p.setAssumeLevel(e.target.checked)} /> Caméra de niveau
            (ignorer l’inclinaison des marqueurs)
          </label>
        )}
        <label>
          Avant du vélo{' '}
          <select value={p.forward} onChange={(e) => p.setForward(e.target.value as ForwardChoice)}>
            <option value="auto">auto</option>
            <option value="right">à droite</option>
            <option value="left">à gauche</option>
          </select>
        </label>
      </div>
    </section>
  );
}

function MarkerSheet({ sizeMm, setSizeMm }: { sizeMm: number; setSizeMm: (n: number) => void }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const size = Math.min(90, Math.max(30, sizeMm));

  useEffect(() => {
    let cancelled = false;
    markerBits([MARKER_IDS.bb, MARKER_IDS.saddle])
      .then(([bb, saddle]) => {
        if (cancelled) return;
        setSvg(
          markerPageSvg(
            [
              { bits: bb, label: 'Marqueur 0 — AXE DE PÉDALIER', hint: "Centre du carré sur l'axe du pédalier, face à la caméra, à plat." },
              {
                bits: saddle,
                label: 'Marqueur 1 — BEC DE SELLE',
                hint: 'Découper au pointillé ; bord supérieur du carton juste sous la pointe de selle, face caméra.',
              },
            ],
            size,
          ),
        );
      })
      .catch((e: unknown) => !cancelled && setErr(String(e)));
    return () => {
      cancelled = true;
    };
  }, [size]);

  const download = (name: string, href: string) => {
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    a.click();
  };

  const downloadSvg = () => {
    if (!svg) return;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    download(`marqueurs-bikefit-${size}mm.svg`, url);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadPng = () => {
    if (!svg) return;
    // A4 à 300 dpi
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 2480;
      c.height = 3508;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      download(`marqueurs-bikefit-${size}mm-A4-300dpi.png`, c.toDataURL('image/png'));
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };

  return (
    <section style={panel}>
      <p style={{ margin: 0 }}>
        Imprime cette page A4 <strong>à 100 %</strong> (désactive « ajuster à la page »), vérifie au réglet que le trait de contrôle
        mesure 100 mm, puis mesure le carré noir et saisis sa taille réelle dans le mode profil. Colle les marqueurs sur un carton rigide.
      </p>
      <label>
        Côté du carré noir (mm, 30–90){' '}
        <input type="number" value={sizeMm} min={30} max={90} onChange={(e) => setSizeMm(Number(e.target.value) || DEFAULT_MARKER_SIZE_MM)} style={{ width: 70 }} />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={downloadSvg} disabled={!svg}>
          Télécharger SVG
        </button>
        <button onClick={downloadPng} disabled={!svg}>
          Télécharger PNG (300 dpi)
        </button>
      </div>
      {err && <p style={errorBox}>{err}</p>}
      {svg && (
        <img
          alt="Aperçu des marqueurs"
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
          style={{ width: 'min(100%, 420px)', border: '1px solid #ccc', background: '#fff' }}
        />
      )}
    </section>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 14px',
        borderRadius: 6,
        border: '1px solid #888',
        background: active ? '#1f2937' : 'transparent',
        color: active ? '#fff' : 'inherit',
        fontWeight: active ? 700 : 400,
      }}
    >
      {children}
    </button>
  );
}

const panel: CSSProperties = { display: 'grid', gap: 10, padding: 12, border: '1px solid #ccc', borderRadius: 8 };
const banner: CSSProperties = { margin: 0, padding: '10px 12px', background: '#1e3a8a', color: '#fff', borderRadius: 6, fontWeight: 600 };
const errorBox: CSSProperties = { margin: 0, padding: '8px 12px', background: '#fee2e2', color: '#991b1b', borderRadius: 6 };
