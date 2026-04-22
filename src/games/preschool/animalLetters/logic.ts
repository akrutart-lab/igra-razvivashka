export type LetterCard = {
  id: number;
  letter: string;
  /** true = буква из слова (остаётся при верном открытии в обычном режиме) */
  fromWord: boolean;
};

export type AnimalLettersMode = "easy" | "medium" | "hard";

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const wordLetterSet = (word: string) => new Set([...word.toUpperCase()].filter(Boolean));

function pickFiller(
  pool: readonly string[],
  forbidden: Set<string>,
  rng: () => number,
): string {
  const safe = pool.filter((c) => !forbidden.has(c));
  const src = safe.length ? safe : pool;
  return src[Math.floor(rng() * src.length)]!;
}

/**
 * Собирает колоду: все буквы слова + N ложных из пула (не из множества букв слова).
 */
export function buildLetterDeck(
  wordUpper: string,
  fillerPool: readonly string[],
  fillerCount: number,
  seed: number,
): LetterCard[] {
  const rng = mulberry32(seed);
  const w = wordUpper.toUpperCase();
  const forbidden = wordLetterSet(w);
  const letters = [...w].filter((ch) => /\S/.test(ch));

  const fillers: string[] = [];
  for (let i = 0; i < fillerCount; i++) {
    fillers.push(pickFiller(fillerPool, forbidden, rng));
  }

  const raw: LetterCard[] = [];
  let id = 0;
  for (const letter of letters) {
    raw.push({ id: id++, letter, fromWord: true });
  }
  for (const letter of fillers) {
    raw.push({ id: id++, letter, fromWord: false });
  }
  return shuffle(raw, rng);
}

/**
 * Колода без перетасовки: буквы слова по порядку, затем ложные (порядок ложных случайный).
 * Расклад по ячейкам поля задаётся снаружи через фиксированную перестановку на сессию.
 */
export function buildLetterDeckOrdered(
  wordUpper: string,
  fillerPool: readonly string[],
  fillerCount: number,
  seed: number,
): LetterCard[] {
  const rng = mulberry32(seed);
  const w = wordUpper.toUpperCase();
  const forbidden = wordLetterSet(w);
  const letters = [...w].filter((ch) => /\S/.test(ch));

  const fillers: string[] = [];
  for (let i = 0; i < fillerCount; i++) {
    fillers.push(pickFiller(fillerPool, forbidden, rng));
  }

  const raw: LetterCard[] = [];
  let id = 0;
  for (const letter of letters) {
    raw.push({ id: id++, letter, fromWord: true });
  }
  const fillerOrder = shuffle(
    fillers.map((letter) => letter),
    rng,
  );
  for (const letter of fillerOrder) {
    raw.push({ id: id++, letter, fromWord: false });
  }
  return raw;
}

/** Перестановка слотов 0..slotCount-1 для фиксированной раскладки на сессию */
export function makeSessionSlotPermutation(slotCount: number, sessionSeed: number): number[] {
  const rng = mulberry32(sessionSeed);
  const idx = Array.from({ length: slotCount }, (_, i) => i);
  return shuffle(idx, rng);
}

export function gridSize(count: number): { cols: number; rows: number } {
  const cols = 3;
  const rows = Math.max(1, Math.ceil(count / cols));
  return { cols, rows };
}

export { mulberry32, shuffle };
