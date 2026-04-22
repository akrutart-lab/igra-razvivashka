/** Слова и пулы букв по ТЗ (лёгкий / средний / сложный). */

export type AnimalDifficulty = "easy" | "medium" | "hard";

export type AnimalEntry = {
  id: string;
  /** Слово заглавными — как на карточках */
  word: string;
  /** Подпись для ребёнка */
  label: string;
};

export const ANIMALS_EASY: AnimalEntry[] = [
  { id: "aist", word: "АИСТ", label: "аист" },
  { id: "enot", word: "ЕНОТ", label: "енот" },
  { id: "lev", word: "ЛЕВ", label: "лев" },
  { id: "les", word: "ЛЕС", label: "лес" },
  { id: "lisa", word: "ЛИСА", label: "лиса" },
  { id: "osa", word: "ОСА", label: "оса" },
  { id: "slon", word: "СЛОН", label: "слон" },
  { id: "sova", word: "СОВА", label: "сова" },
];

/** Буквы для ложных карточек на лёгком уровне (из ТЗ) */
export const EASY_FILLER_POOL = ["А", "В", "Е", "И", "Л", "Н", "О", "С", "Т"] as const;

export const ANIMALS_MEDIUM: AnimalEntry[] = [
  { id: "aist", word: "АИСТ", label: "аист" },
  { id: "enot", word: "ЕНОТ", label: "енот" },
  { id: "ehidna", word: "ЕХИДНА", label: "ехидна" },
  { id: "indyuk", word: "ИНДЮК", label: "индюк" },
  { id: "landysh", word: "ЛАНДЫШ", label: "ландыш" },
  { id: "les", word: "ЛЕС", label: "лес" },
  { id: "lisa", word: "ЛИСА", label: "лиса" },
  { id: "mysh", word: "МЫШЬ", label: "мышь" },
  { id: "pen", word: "ПЕНЬ", label: "пень" },
  { id: "petuh", word: "ПЕТУХ", label: "петух" },
  { id: "tyulen", word: "ТЮЛЕНЬ", label: "тюлень" },
];

export const MEDIUM_FILLER_POOL = [
  "А",
  "Д",
  "Е",
  "И",
  "К",
  "Л",
  "М",
  "Н",
  "О",
  "П",
  "С",
  "Т",
  "У",
  "Х",
  "Ш",
  "Ы",
  "Ь",
  "Ю",
] as const;

export const ANIMALS_HARD: AnimalEntry[] = [
  { id: "belka", word: "БЕЛКА", label: "белка" },
  { id: "grach", word: "ГРАЧ", label: "грач" },
  { id: "grif", word: "ГРИФ", label: "гриф" },
  { id: "yozh", word: "ЁЖ", label: "ёж" },
  { id: "zhiraf", word: "ЖИРАФ", label: "жираф" },
  { id: "zebra", word: "ЗЕБРА", label: "зебра" },
  { id: "kozel", word: "КОЗЁЛ", label: "козёл" },
  { id: "krab", word: "КРАБ", label: "краб" },
  { id: "chizh", word: "ЧИЖ", label: "чиж" },
  { id: "schegol", word: "ЩЕГОЛ", label: "щегол" },
  { id: "schuka", word: "ЩУКА", label: "щука" },
];

export function animalsForDifficulty(d: AnimalDifficulty): AnimalEntry[] {
  if (d === "easy") return ANIMALS_EASY;
  if (d === "medium") return ANIMALS_MEDIUM;
  return ANIMALS_HARD;
}

export function fillerPoolForDifficulty(d: AnimalDifficulty): readonly string[] {
  if (d === "easy") return EASY_FILLER_POOL;
  if (d === "medium") return MEDIUM_FILLER_POOL;
  return [...MEDIUM_FILLER_POOL, "Б", "Г", "З", "К", "Ч", "Щ", "Ё"];
}
