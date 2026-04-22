import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { AnimalDifficulty } from "../../data/preschoolAnimals";
import { mountAnimalLetters, type AnimalLettersApi } from "./animalLetters/pixiAnimalLetters";

type Props = { onBack: () => void };

export function AnimalLettersScreen({ onBack }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const api = useMemo<AnimalLettersApi>(() => ({ nextLevel: () => {} }), []);
  const [difficulty, setDifficulty] = useState<AnimalDifficulty>("easy");

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    el.innerHTML = "";
    const cleanup = mountAnimalLetters({ host: el, difficulty, api });
    return cleanup;
  }, [api, difficulty]);

  return (
    <div class="game-host">
      <div class="toolbar toolbar--animal-letters">
        <button type="button" class="back-btn" onClick={onBack}>
          ← Назад
        </button>
        <label>
          Сложность
          <select
            value={difficulty}
            onChange={(e) => setDifficulty((e.currentTarget as HTMLSelectElement).value as AnimalDifficulty)}
          >
            <option value="easy">Лёгкий (3–4 буквы)</option>
            <option value="medium">Средний (3–6 букв)</option>
            <option value="hard">Сложный (3–6 букв)</option>
          </select>
        </label>
        <button type="button" class="back-btn" onClick={() => api.nextLevel()}>
          Следующий уровень
        </button>
      </div>
      <div class="animal-letters-wrap">
        <div ref={hostRef} class="animal-letters-canvas-host" />
      </div>
    </div>
  );
}
