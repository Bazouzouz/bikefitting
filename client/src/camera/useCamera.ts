import { useCallback, useEffect, useRef, useState } from 'react';
import { cameraErrorMessage, environmentProblem } from './errors';

export interface CameraState {
  devices: MediaDeviceInfo[];
  deviceId: string | null;
  setDeviceId: (id: string | null) => void;
  stream: MediaStream | null;
  error: string | null;
  starting: boolean;
  start: () => void;
  stop: () => void;
}

function stopStream(s: MediaStream | null) {
  s?.getTracks().forEach((t) => t.stop());
}

/** Gestion getUserMedia : sélection de caméra, permissions, arrêt propre des pistes. */
export function useCamera(): CameraState {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [wanted, setWanted] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter((d) => d.kind === 'videoinput'));
    } catch {
      /* liste indisponible : on garde la caméra par défaut */
    }
  }, []);

  useEffect(() => {
    if (!wanted) return;
    const problem = environmentProblem({
      isSecureContext: typeof window !== 'undefined' && window.isSecureContext,
      hasMediaDevices: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
    });
    if (problem) {
      setError(problem);
      setWanted(false);
      return;
    }
    let cancelled = false;
    setStarting(true);
    setError(null);
    const video: MediaTrackConstraints = {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }),
    };
    navigator.mediaDevices
      .getUserMedia({ video, audio: false })
      .then((s) => {
        if (cancelled) {
          stopStream(s);
          return;
        }
        streamRef.current = s;
        setStream(s);
        // les libellés ne sont disponibles qu'après autorisation
        void refreshDevices();
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(cameraErrorMessage(e));
          setStarting(false);
          // permet de réessayer avec « Démarrer la caméra »
          setWanted(false);
        }
      })
      .finally(() => {
        if (!cancelled) setStarting(false);
      });
    return () => {
      cancelled = true;
      stopStream(streamRef.current);
      streamRef.current = null;
      setStream(null);
    };
  }, [wanted, deviceId, refreshDevices]);

  useEffect(() => {
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!md) return;
    const onChange = () => void refreshDevices();
    md.addEventListener?.('devicechange', onChange);
    return () => md.removeEventListener?.('devicechange', onChange);
  }, [refreshDevices]);

  return {
    devices,
    deviceId,
    setDeviceId,
    stream,
    error,
    starting,
    start: () => setWanted(true),
    stop: () => setWanted(false),
  };
}
