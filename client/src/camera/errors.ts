/**
 * Messages d'erreur caméra en français — fonctions pures.
 */

export interface CameraEnvironment {
  isSecureContext: boolean;
  hasMediaDevices: boolean;
}

/** Vérifie l'environnement avant d'appeler getUserMedia. Renvoie un message ou null. */
export function environmentProblem(env: CameraEnvironment): string | null {
  if (!env.isSecureContext) {
    return "La caméra n'est accessible qu'en HTTPS (ou sur localhost). Ouvre l'application via son adresse https:// et accepte le certificat de développement.";
  }
  if (!env.hasMediaDevices) {
    return "Ce navigateur ne donne pas accès à la caméra (navigator.mediaDevices indisponible). Essaie avec un navigateur récent (Chrome, Safari, Firefox).";
  }
  return null;
}

/** Traduit une erreur getUserMedia en message lisible. */
export function cameraErrorMessage(err: unknown): string {
  const name =
    err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return "Accès à la caméra refusé. Autorise la caméra pour ce site dans les réglages du navigateur (icône à gauche de l'adresse), puis réessaie.";
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'Aucune caméra trouvée. Branche une webcam ou utilise un téléphone.';
    case 'NotReadableError':
    case 'TrackStartError':
      return "La caméra est déjà utilisée par une autre application (visio, autre onglet…). Ferme-la puis réessaie.";
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return "La caméra choisie ne supporte pas la résolution demandée. Choisis une autre caméra.";
    case 'SecurityError':
      return "Accès à la caméra bloqué pour des raisons de sécurité (HTTPS requis ou politique du navigateur).";
    case 'AbortError':
      return "L'ouverture de la caméra a été interrompue. Réessaie.";
    default: {
      const msg = err instanceof Error ? err.message : String(err ?? '');
      return `Impossible d'ouvrir la caméra${msg ? ` : ${msg}` : '.'}`;
    }
  }
}
