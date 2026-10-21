# Mode caméra

Prototype d'aide au réglage sur le vrai vélo. Détail technique, calibrations et limites :
[client/src/camera/README.md](../client/src/camera/README.md) (non dupliqué ici).

## Principe
Une seule caméra ne voit pas tout : deux captures successives.
- **Vélo de profil** : selle et cocottes. Calibration par deux marqueurs ArUco (id 0 sur le BB,
  id 1 sous le bec de selle), à imprimer depuis l'app, ou calibration manuelle par clics.
  Le fantôme cible est superposé à la vidéo : vert dans la tolérance, orange puis rouge au-delà,
  avec messages (« Monte la selle de 12 mm »).
- **Cycliste de face** : pas de détection de pose ; l'utilisateur clique cintre, épaules,
  genoux et cales. Contrôle de l'aplomb genou/cale, de la largeur d'épaules et de la symétrie.

Repère identique au reste de l'app : mm, degrés, origine au BB.

## Précision
Visée : ±3 mm en hauteur, ±5 mm en recul. Réelle : environ **7 à 15 mm**, car l'échelle ne
vient que de marqueurs de ~80 mm (1 px d'erreur sur le côté = 1 à 2 % d'échelle sur
~750 mm BB→bec). Le lissage réduit le bruit mais pas le biais. S'ajoutent la perspective, la
distorsion des objectifs de téléphone et le soin de pose du marqueur de selle. À traiter comme
une aide de réglage, pas comme une mesure.

## Décisions ouvertes
- Repérage : ArUco (actuel), pastilles colorées ou détection automatique de pose.
- Source d'échelle plus grande (empattement, 3e marqueur) pour approcher ±3 mm.
- Pose des marqueurs : gabarit pour fixer le décalage marqueur→bec.
- Vue de face : capture successive ou deux appareils ; tolérances et suivi en pédalage.
- Orientation : « caméra de niveau » ou capteur d'inclinaison du téléphone.

## Technique
La caméra exige HTTPS (d'où le certificat auto-signé du serveur de dev). Pour l'utiliser avec
un téléphone : `npm run dev:lan`, ouvrir l'adresse réseau en HTTPS et accepter le
certificat ; l'API reste en 127.0.0.1 (proxy Vite). Le code de géométrie
est pur et testé ; la détection ArUco passe par `aruco.ts` seul (bibliothèque `js-aruco2`).
