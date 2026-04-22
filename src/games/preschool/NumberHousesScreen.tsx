import { useEffect, useRef, useState } from "preact/hooks";
import { mountNumberHouses } from "./numberHouses/pixiNumberHouses";

type Props = { onBack: () => void };

type Difficulty = "easy" | "medium";

export function NumberHousesScreen({ onBack }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    el.innerHTML = "";
    const cleanup = mountNumberHouses({ host: el, difficulty });
    return cleanup;
  }, [difficulty]);

  return (
    <div class="game-host">
      <div class="toolbar">
        <button type="button" class="back-btn" onClick={onBack}>
          ← Назад
        </button>
        <label>
          Уровень
          <select
            value={difficulty}
            onInput={(e) => setDifficulty((e.currentTarget as HTMLSelectElement).value as Difficulty)}
          >
            <option value="easy">Числа 3–10</option>
            <option value="medium">Числа 11–20 и лишние кирпичики</option>
          </select>
        </label>
      </div>
      <p class="hint">
        Перетащи кирпичик к дому на крышу, отпусти. Затем так же второй. Если сумма совпала с числом на крыше —
        получится «щёлк». Нужно найти все разные пары без повторов.
      </p>
      <div class="number-houses-wrap">
        <div ref={hostRef} class="number-houses-canvas-host" />
      </div>
    </div>
  );
}
