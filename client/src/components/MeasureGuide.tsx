import { MEASURE_GUIDE, type DimKey } from '../fit/measureGuide';

/** Carte « comment prendre la mesure » pour la cote active. */
export function MeasureGuide({ k }: { k: DimKey | null }) {
  const g = k ? MEASURE_GUIDE[k] : null;
  return (
    <aside className="measure-guide" aria-live="polite">
      {g ? (
        <>
          <h3>Comment mesurer : {g.title}</h3>
          <p className="mg-tools"><strong>Matériel :</strong> {g.tools}</p>
          <ol>
            {g.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p className="mg-tip"><strong>Astuce :</strong> {g.tip}</p>
        </>
      ) : (
        <p className="mg-tools">Choisis une cote pour voir comment la mesurer.</p>
      )}
    </aside>
  );
}
