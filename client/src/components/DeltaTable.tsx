import type { Frame } from '../blueprint/geometry';
import type { CurrentSetup, FitResult } from '../fit/types';
import { fmtDelta, fmtNum } from '../blueprint/geometry';
import { buildRows, STATUS_LABEL } from './rows';

/** Tableau « réglage actuel → cible » avec delta. `frame` (toFrame de la taille) : requis pour juger potence et entretoises comme le guide cockpit. */
export function DeltaTable({ fit, current, frame }: { fit: FitResult; current: CurrentSetup; frame?: Frame }) {
  const rows = buildRows(fit, current, frame);
  return (
    <table className="delta-table">
      <thead>
        <tr>
          <th>Réglage</th>
          <th className="num">Actuel</th>
          <th aria-hidden="true" />
          <th className="num">Cible</th>
          <th className="num">Écart</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const d = r.target - r.current;
          return (
            <tr key={r.key} title={`${r.why} Tolérance : ${r.tolerance ?? `${fmtNum(r.range[0], r.dec)} à ${fmtNum(r.range[1], r.dec)} ${r.unit}`}.`} className={r.status === 'off' ? 'off' : 'ok'}>
              <td>{r.label}</td>
              <td className="num">
                {fmtNum(r.current, r.dec)} {r.unit}
              </td>
              <td aria-hidden="true">→</td>
              <td className="num target">
                {fmtNum(r.target, r.dec)} {r.unit}
              </td>
              <td className="num delta">
                {fmtDelta(d, r.unit, r.dec)}
                <span className="badge">{STATUS_LABEL[r.status]}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
