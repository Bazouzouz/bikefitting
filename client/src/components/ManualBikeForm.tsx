import { useId, useRef, useState } from "react";
import type { Bike, BikeSize, BikeStyle } from "@bikefit/shared";
import {
  BIKE_STYLES,
  STYLE_LIST,
  archetypeOf,
  isBikeStyle,
  styleChoiceError,
} from "../bike-styles";

const EMPTY: BikeSize = {
  label: "M",
  stack: 580,
  reach: 395,
  seatTubeAngle: 73.5,
  headTubeAngle: 71,
  chainstay: 425,
  stemLength: 100,
  handlebarWidth: 420,
  crankLength: 172.5,
  seatTubeLength: 540,
  headTubeLength: 130,
  bbDrop: 70,
  forkLength: 395,
  forkOffset: 50,
  stemAngle: -6,
  spacers: 20,
};

type NumKey = Exclude<
  {
    [K in keyof BikeSize]: BikeSize[K] extends number | undefined ? K : never;
  }[keyof BikeSize],
  undefined
>;

const FIELDS: Array<{
  key: NumKey;
  label: string;
  step?: number;
  adv?: boolean;
}> = [
  { key: "stack", label: "Stack (mm)" },
  { key: "reach", label: "Reach (mm)" },
  { key: "seatTubeAngle", label: "Angle tube de selle (°)", step: 0.5 },
  { key: "headTubeAngle", label: "Angle de direction (°)", step: 0.5 },
  { key: "chainstay", label: "Bases (mm)" },
  { key: "stemLength", label: "Potence (mm)" },
  { key: "handlebarWidth", label: "Cintre (mm)" },
  { key: "crankLength", label: "Manivelle (mm)", step: 2.5 },
  { key: "seatTubeLength", label: "Tube de selle (mm)", adv: true },
  { key: "headTubeLength", label: "Tube de direction (mm)", adv: true },
  { key: "bbDrop", label: "Chute de boîtier (mm)", adv: true },
  { key: "forkLength", label: "Longueur de fourche (mm)", adv: true },
  { key: "forkOffset", label: "Déport de fourche (mm)", adv: true },
  { key: "stemAngle", label: "Angle de potence (°)", adv: true },
  { key: "spacers", label: "Entretoises (mm)", adv: true },
  { key: "riderHeightMin", label: "Taille cycliste mini (cm)", adv: true },
  { key: "riderHeightMax", label: "Taille cycliste maxi (cm)", adv: true },
];

/** Préremplit une taille avec les valeurs de l'archétype (garde libellé, stack, reach et taille cycliste). */
function withArchetype(sz: BikeSize, style: BikeStyle): BikeSize {
  const stack =
    Number.isFinite(sz.stack) && sz.stack > 0 ? sz.stack : EMPTY.stack;
  const { reach: _r, ...d } = archetypeOf(style).frameDefaults(stack);
  return { ...sz, ...d, stack };
}

/** Saisie manuelle : style de vélo (obligatoire), puis une ou plusieurs tailles. */
export function ManualBikeForm({
  onSubmit,
}: {
  onSubmit: (bike: Bike) => void;
}) {
  // Aucun style présélectionné : l'utilisateur doit choisir.
  const [style, setStyle] = useState<BikeStyle | "">("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [tyre, setTyre] = useState<number>(40);
  // Chaque taille a un identifiant stable (les libellés peuvent être vides ou en double pendant la saisie).
  const nextId = useRef(1);
  const [entries, setEntries] = useState<Array<{ id: number; size: BikeSize }>>(
    [{ id: 0, size: { ...EMPTY } }],
  );
  const [idx, setIdx] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const uid = useId();
  const sizes = entries.map((e) => e.size);
  const s = sizes[idx] ?? sizes[0]!;

  const patch = (p: Partial<BikeSize>) =>
    setEntries((all) =>
      all.map((x, i) => (i === idx ? { ...x, size: { ...x.size, ...p } } : x)),
    );

  const onTabKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const n = entries.length;
    const next =
      e.key === "ArrowRight"
        ? (idx + 1) % n
        : e.key === "ArrowLeft"
          ? (idx - 1 + n) % n
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? n - 1
              : -1;
    if (next < 0) return;
    e.preventDefault();
    setIdx(next);
    e.currentTarget.querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus();
  };

  function validate(): string[] {
    const errs: string[] = [];
    const styleErr = styleChoiceError(style);
    if (styleErr) errs.push(styleErr);
    if (!Number.isFinite(tyre) || tyre < 20 || tyre > 70)
      errs.push("Largeur de pneu : entre 20 et 70 mm.");
    const seen = new Set<string>();
    sizes.forEach((sz, i) => {
      const name = sz.label.trim();
      const who = name ? `Taille « ${name} »` : `Taille n°${i + 1}`;
      if (!name) errs.push(`${who} : libellé manquant.`);
      else if (seen.has(name.toLowerCase()))
        errs.push(`${who} : libellé en double.`);
      seen.add(name.toLowerCase());
      for (const f of FIELDS.filter((f) => !f.adv)) {
        const v = sz[f.key];
        if (typeof v !== "number" || !Number.isFinite(v) || v <= 0)
          errs.push(`${who} : « ${f.label} » doit être un nombre positif.`);
      }
    });
    return errs;
  }

  return (
    <form
      className="manual-form"
      onSubmit={(e) => {
        e.preventDefault();
        const errs = validate();
        setErrors(errs);
        if (errs.length > 0 || !isBikeStyle(style)) return;
        onSubmit({
          id: `manual-${Date.now()}`,
          brand: brand.trim() || "Vélo",
          model: model.trim() || "perso",
          style,
          sizes: sizes.map((sz) => ({ ...sz, label: sz.label.trim() })),
          wheel: { bsd: 622, tyreWidth: tyre },
        });
      }}
    >
      <div className="grid-2">
        <label htmlFor="bike-style">
          Style de vélo
          <select
            id="bike-style"
            name="style"
            value={style}
            aria-invalid={errors.length > 0 && !style ? true : undefined}
            onChange={(e) => {
              const v = e.target.value;
              if (!isBikeStyle(v) || !BIKE_STYLES[v].available) {
                setStyle("");
                return;
              }
              setStyle(v);
              setEntries((all) =>
                all.map((x) => ({ ...x, size: withArchetype(x.size, v) })),
              );
              setTyre(archetypeOf(v).drawing.tyreWidth);
            }}
          >
            <option value="">Choisir…</option>
            {STYLE_LIST.map((st) => (
              <option key={st.id} value={st.id} disabled={!st.available}>
                {st.available ? st.label : `${st.label} (bientôt)`}
              </option>
            ))}
          </select>
        </label>
        <label>
          Marque
          <input value={brand} onChange={(e) => setBrand(e.target.value)} />
        </label>
        <label>
          Modèle
          <input value={model} onChange={(e) => setModel(e.target.value)} />
        </label>
        <label>
          Largeur de pneu (mm) — jante 622
          <input
            type="number"
            min={20}
            max={70}
            value={Number.isNaN(tyre) ? "" : tyre}
            onChange={(e) =>
              setTyre(
                e.target.value === "" ? Number.NaN : Number(e.target.value),
              )
            }
          />
        </label>
      </div>

      <div className="size-tabs">
        <div
          className="size-tabs-list"
          role="tablist"
          aria-label="Tailles saisies"
          onKeyDown={onTabKey}
        >
          {entries.map(({ id, size: x }, i) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`${uid}-tab-${id}`}
              data-tab={i}
              aria-selected={i === idx}
              aria-controls={`${uid}-panel`}
              tabIndex={i === idx ? 0 : -1}
              className={i === idx ? "on" : ""}
              onClick={() => setIdx(i)}
            >
              {x.label || "?"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setEntries((all) => [
              ...all,
              { id: nextId.current++, size: { ...s, label: "" } },
            ]);
            setIdx(sizes.length);
          }}
        >
          + taille
        </button>
        {sizes.length > 1 && (
          <button
            type="button"
            onClick={() => {
              setEntries((all) => all.filter((_, i) => i !== idx));
              setIdx(0);
            }}
          >
            Supprimer
          </button>
        )}
      </div>

      <div
        className="size-panel"
        role="tabpanel"
        id={`${uid}-panel`}
        aria-labelledby={`${uid}-tab-${entries[idx]?.id ?? 0}`}
      >
        <div className="grid-3">
          <label>
            Libellé de taille
            <input
              value={s.label}
              onChange={(e) => patch({ label: e.target.value })}
              required
            />
          </label>
          {FIELDS.filter((f) => !f.adv).map((f) => (
            <label key={f.key}>
              {f.label}
              <input
                type="number"
                step={f.step ?? 1}
                value={Number.isFinite(s[f.key]) ? s[f.key] : ""}
                onChange={(e) =>
                  patch({
                    [f.key]:
                      e.target.value === ""
                        ? Number.NaN
                        : Number(e.target.value),
                  })
                }
                min={0}
                required
              />
            </label>
          ))}
        </div>
        <details>
          <summary>Cotes optionnelles (affinent le plan)</summary>
          <div className="grid-3">
            {FIELDS.filter((f) => f.adv).map((f) => (
              <label key={f.key}>
                {f.label}
                <input
                  type="number"
                  step={f.step ?? 1}
                  value={s[f.key] ?? ""}
                  onChange={(e) =>
                    patch({
                      [f.key]:
                        e.target.value === ""
                          ? undefined
                          : Number(e.target.value),
                    })
                  }
                />
              </label>
            ))}
          </div>
        </details>
      </div>
      {errors.length > 0 && (
        <ul className="error" role="alert">
          {errors.map((m, i) => (
            <li key={`${i}-${m}`}>{m}</li>
          ))}
        </ul>
      )}
      <button type="submit" className="btn primary">
        Utiliser ce vélo
      </button>
    </form>
  );
}
