import { BIKE_STYLES, styleOf } from '../../bike-styles';
import { SOURCE_LABEL } from '../../components/sourceLabel';
import { useBikeLookup } from '../../components/useBikeLookup';
import { ManualBikeForm } from '../../components/ManualBikeForm';
import { useStore } from '../../components/store';
import { PhasePanel } from '../PhasePanel';

/** Phase 1 : choix du vélo (lien, GRVL du catalogue, saisie manuelle). Le dessin est sur la scène. */
export function BikePhase() {
  const bike = useStore((s) => s.bike);
  const source = useStore((s) => s.source);
  const warnings = useStore((s) => s.warnings);
  const { url, setUrl, busy, error, manual, setManual, lookup, pickGrvl, pickManual } = useBikeLookup();

  return (
    <PhasePanel phase="bike" title="Quel est ton vélo ?" canNext={bike !== null} nextHint="Choisis d'abord un vélo.">
      <form
        className="ws-lookup field"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) void lookup();
        }}
      >
        <label htmlFor="bike-url">Lien d'un commerçant ou du constructeur</label>
        <div className="row">
          <input
            id="bike-url"
            type="url"
            inputMode="url"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button type="submit" className="btn primary" disabled={busy || !url.trim()}>
            {busy ? 'Analyse…' : 'Analyser'}
          </button>
        </div>
      </form>
      <div className="row">
        <button type="button" className="btn" onClick={() => void pickGrvl()} disabled={busy}>
          Utiliser le GRVL AF
        </button>
        <button type="button" className="btn" onClick={() => setManual((m) => !m)} aria-expanded={manual}>
          Saisie manuelle
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {manual && <ManualBikeForm onSubmit={pickManual} />}

      {bike && (
        <article className="ws-bike">
          <p className="ws-bike-name">
            {bike.brand} {bike.model}
          </p>
          <div className="tool">
            <span className="chip">{BIKE_STYLES[styleOf(bike)].label}</span>
            <span className="chip">
              {bike.sizes.length} taille{bike.sizes.length > 1 ? 's' : ''} : {bike.sizes.map((s) => s.label).join(' · ')}
            </span>
            {source && <span className="chip">{SOURCE_LABEL[source]}</span>}
          </div>
          {bike.sourceUrl && (
            <a href={bike.sourceUrl} target="_blank" rel="noreferrer" className="link">
              Fiche constructeur
            </a>
          )}
          {warnings.length > 0 && (
            <div className="warnings" role="note">
              <strong>À vérifier</strong>
              <ul>
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </article>
      )}
    </PhasePanel>
  );
}
