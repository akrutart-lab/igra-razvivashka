import type { AnimalEntry } from "../../../data/preschoolAnimals";
import { mulberry32, shuffle } from "./logic";

function maxLetterCountsForList(words: string[]): Map<string, number> {
  const globalMax = new Map<string, number>();
  for (const w of words) {
    const u = w.toUpperCase().replace(/\s/g, "");
    const local = new Map<string, number>();
    for (const ch of u) {
      if (!ch) continue;
      local.set(ch, (local.get(ch) ?? 0) + 1);
    }
    for (const [ch, n] of local) {
      globalMax.set(ch, Math.max(globalMax.get(ch) ?? 0, n));
    }
  }
  return globalMax;
}

function multisetToList(counts: Map<string, number>): string[] {
  const out: string[] = [];
  for (const [ch, n] of counts) {
    for (let i = 0; i < n; i++) out.push(ch);
  }
  return out;
}

/** Перемешать буквы на поле (тот же набор, новый порядок). */
export function reshuffleLetters(letters: string[], seed: number): string[] {
  const rng = mulberry32(seed);
  return shuffle([...letters], rng);
}

/**
 * Буквы уровня: по списку слов считаем, сколько раз какая буква нужна максимум в одном слове.
 * Расклад 3 в ряд; строк столько, сколько нужно (минимум 3×3).
 * Порядок букв в массиве — один раз на сессию (перемешивается в pixi при создании уровня).
 */
export function buildFixedLevelLetters(
  animals: AnimalEntry[],
  fillerPool: readonly string[],
  sessionSeed: number,
): { letters: string[]; cols: number; rows: number } {
  const rng = mulberry32(sessionSeed ^ 0x9e3779b9);
  const need = maxLetterCountsForList(animals.map((a) => a.word));
  let tiles = multisetToList(need);
  tiles = shuffle(tiles, rng);

  const minCells = 9;
  let pool = [...fillerPool];
  pool = shuffle(pool, rng);

  const padded = Math.max(minCells, Math.ceil(tiles.length / 3) * 3);
  while (tiles.length < padded) {
    tiles.push(pool[tiles.length % pool.length]!);
  }

  tiles = shuffle(tiles, rng);
  tiles = shuffle(tiles, mulberry32(sessionSeed ^ 0x51ed));
  const cols = 3;
  const rows = tiles.length / cols;
  return { letters: tiles, cols, rows };
}

export function multisetFromWord(wordUpper: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const ch of wordUpper.toUpperCase().replace(/\s/g, "")) {
    if (!ch) continue;
    m.set(ch, (m.get(ch) ?? 0) + 1);
  }
  return m;
}

export function cloneMultiset(m: Map<string, number>): Map<string, number> {
  return new Map(m);
}
