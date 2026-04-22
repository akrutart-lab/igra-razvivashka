import { Application, Assets, Container, FederatedPointerEvent, Graphics, Sprite, Text, Texture } from "pixi.js";
import type { AnimalDifficulty } from "../../../data/preschoolAnimals";
import { animalsForDifficulty, fillerPoolForDifficulty } from "../../../data/preschoolAnimals";
import {
  buildFixedLevelLetters,
  cloneMultiset,
  multisetFromWord,
  reshuffleLetters,
} from "./levelBoard";
import { mulberry32, shuffle } from "./logic";

export type AnimalLettersApi = {
  nextLevel: () => void;
};

type Opts = {
  host: HTMLElement;
  /** По умолчанию — лёгкий набор слов (3–4 буквы) */
  difficulty?: AnimalDifficulty;
  api?: AnimalLettersApi;
};

type TileModel = { id: number; letter: string };

const BG = 0xf2f7fb;
const CARD_DOWN = 0xc5dff0;
const CARD_UP = 0xffffff;
const CARD_OK = 0xb8f0c8;
const ACCENT = 0x3d8eb9;

/** Неверная буква снова закрывается через столько времени */
const WRONG_LETTER_HOLD_MS = 750;

const BASE = import.meta.env.BASE_URL;
const COVER_URL = `${BASE}games/animal-letters/cover.png`;
const FON_URL = `${BASE}games/animal-letters/fon.png`;

/** Иллюстрации по `id` животного из `public/games/animal-letters/` */
const HERO_ASSETS: Record<string, string> = {
  aist: `${BASE}games/animal-letters/stork.png`,
  enot: `${BASE}games/animal-letters/enot.png`,
  lev: `${BASE}games/animal-letters/leo.png`,
  les: `${BASE}games/animal-letters/forest.png`,
  lisa: `${BASE}games/animal-letters/fox.png`,
  osa: `${BASE}games/animal-letters/wasp.png`,
  slon: `${BASE}games/animal-letters/elephant.png`,
  sova: `${BASE}games/animal-letters/owl.png`,
};

function fitCoverSprite(s: Sprite, w: number, h: number) {
  const tw = s.texture.width;
  const th = s.texture.height;
  const sc = Math.max(w / tw, h / th);
  s.scale.set(sc);
  s.anchor.set(0.5);
  s.x = w / 2;
  s.y = h / 2;
}

function makeCardFace(
  w: number,
  h: number,
  letter: string,
  faceUp: boolean,
  lockedOk: boolean,
  hintTexture: Texture | null,
): Container {
  const c = new Container();
  const g = new Graphics();
  const fill = !faceUp ? CARD_DOWN : lockedOk ? CARD_OK : CARD_UP;
  g.roundRect(0, 0, w, h, 14).fill({ color: fill, alpha: 1 });
  g.roundRect(0, 0, w, h, 14).stroke({ width: 2, color: faceUp ? 0x8aa6b5 : 0x9bb8c9 });
  c.addChild(g);

  if (!faceUp && hintTexture) {
    const s = new Sprite(hintTexture);
    s.alpha = 0.2;
    s.anchor.set(0.5);
    s.x = w / 2;
    s.y = h / 2;
    const sc = Math.min((w * 0.88) / hintTexture.width, (h * 0.88) / hintTexture.height);
    s.scale.set(sc);
    c.addChild(s);
  }

  const style = new Text({
    text: faceUp ? letter : "?",
    style: {
      fontFamily: "system-ui, Segoe UI, Roboto, sans-serif",
      fontSize: Math.min(w, h) * (faceUp ? 0.42 : 0.46),
      fontWeight: "700",
      fill: 0x1e2a32,
    },
  });
  style.anchor.set(0.5);
  style.x = w / 2;
  style.y = h / 2;
  c.addChild(style);
  return c;
}

type LayoutCache = {
  width: number;
  padX: number;
  top: number;
  cw: number;
  ch: number;
  gap: number;
  cols: number;
  gridCenterX: number;
  gridCenterY: number;
};

type Cell = {
  model: TileModel;
  face: Container;
  faceUp: boolean;
  locked: boolean;
  cw: number;
  ch: number;
  gridX: number;
  gridY: number;
};

function playConfetti(stage: Container, cx: number, cy: number, isDead: () => boolean) {
  const colors = [0xff6b9d, 0xffd569, 0x7dd96f, 0x6bcfff, 0xc78cff, 0xff9f6e];
  type P = { g: Graphics; vx: number; vy: number; ay: number };
  const pieces: P[] = [];
  for (let i = 0; i < 40; i++) {
    const g = new Graphics();
    g.eventMode = "none";
    g.roundRect(-3, -4, 6, 8, 2).fill({ color: colors[i % colors.length]! });
    g.x = cx;
    g.y = cy;
    const ang = (Math.PI * 2 * i) / 40 + Math.random() * 0.45;
    const sp = 2.5 + Math.random() * 4.8;
    pieces.push({ g, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 2.5, ay: 0.15 });
    stage.addChild(g);
  }
  const t0 = performance.now();
  function tick(now: number) {
    if (isDead()) {
      for (const p of pieces) p.g.destroy();
      return;
    }
    const t = now - t0;
    if (t > 900) {
      for (const p of pieces) p.g.destroy();
      return;
    }
    for (const p of pieces) {
      p.vy += p.ay;
      p.g.x += p.vx;
      p.g.y += p.vy;
      p.g.rotation += 0.08;
      p.g.alpha = Math.max(0, 1 - t / 900);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function tweenXY(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  duration: number,
  isDead: () => boolean,
  onFrame: (x: number, y: number) => void,
  onDone?: () => void,
) {
  const t0 = performance.now();
  function step(now: number) {
    if (isDead()) return;
    const u = Math.min(1, (now - t0) / duration);
    const e = 1 - (1 - u) ** 3;
    onFrame(sx + (tx - sx) * e, sy + (ty - sy) * e);
    if (u < 1) requestAnimationFrame(step);
    else onDone?.();
  }
  requestAnimationFrame(step);
}

function tweenProp(
  from: number,
  to: number,
  duration: number,
  isDead: () => boolean,
  onFrame: (v: number) => void,
  onDone?: () => void,
) {
  const t0 = performance.now();
  function step(now: number) {
    if (isDead()) return;
    const u = Math.min(1, (now - t0) / duration);
    const e = 1 - (1 - u) ** 3;
    onFrame(from + (to - from) * e);
    if (u < 1) requestAnimationFrame(step);
    else onDone?.();
  }
  requestAnimationFrame(step);
}

export function mountAnimalLetters(opts: Opts): () => void {
  const { host, api } = opts;
  const difficulty = opts.difficulty ?? "easy";
  let destroyed = false;
  let app: Application | null = null;
  let busy = false;

  const animals = animalsForDifficulty(difficulty);
  const fillerPool = fillerPoolForDifficulty(difficulty);
  const sessionSeed = (Date.now() ^ (Math.random() * 0x7fffffff)) | 0;

  let fixedLetters: string[] = [];
  let cols = 3;
  let rows = 3;
  let level = 1;
  let wordOrder: number[] = [];
  let wordProgress = 0;

  let cells: Cell[] = [];
  let remaining = new Map<string, number>();
  let layoutCache: LayoutCache | null = null;
  let titleSubNode: Text | null = null;
  let titleMainNode: Text | null = null;
  let mainStage: Container | null = null;
  let bgGraphics: Graphics | null = null;
  let fonBgSprite: Sprite | null = null;
  let fonTexture: Texture | null = null;

  const heroTextures = new Map<string, Texture>();
  let coverTexture: Texture | null = null;
  let heroPin: Container | null = null;
  let heroPad: Graphics | null = null;
  let heroSprite: Sprite | null = null;

  function currentAnimalIndex(): number {
    return wordOrder[wordProgress] ?? 0;
  }

  function wordUpper(): string {
    return animals[currentAnimalIndex()]!.word;
  }

  function makeShuffledOrder(seed: number): number[] {
    const rng = mulberry32(seed);
    const idx = animals.map((_, i) => i);
    return shuffle(idx, rng);
  }

  function initLevelLayout(seed: number) {
    const built = buildFixedLevelLetters(animals, fillerPool, seed);
    fixedLetters = built.letters;
    cols = built.cols;
    rows = built.rows;
  }

  initLevelLayout(sessionSeed);
  wordOrder = makeShuffledOrder(sessionSeed ^ 0x2f6d4b);
  wordProgress = 0;

  const root = document.createElement("div");
  root.style.width = "100%";
  root.style.position = "relative";
  host.appendChild(root);

  const canvasHost = document.createElement("div");
  canvasHost.style.width = "100%";
  root.appendChild(canvasHost);

  const hudWrap = document.createElement("div");
  hudWrap.className = "animal-letters-hud";
  const hudMeta = document.createElement("div");
  hudMeta.className = "animal-letters-hud__meta";
  const hudBanner = document.createElement("div");
  hudBanner.className = "animal-letters-hud__banner";
  hudBanner.setAttribute("aria-live", "polite");
  hudWrap.appendChild(hudMeta);
  hudWrap.appendChild(hudBanner);
  root.appendChild(hudWrap);

  function setHud(text: string, opts?: { wordBanner?: string | null }) {
    const t = text.trim();
    hudMeta.textContent = t;
    hudMeta.style.display = t ? "block" : "none";
    if (opts?.wordBanner) {
      hudBanner.textContent = opts.wordBanner;
      hudBanner.style.display = "block";
      hudBanner.classList.remove("animal-letters-hud__banner--pop");
      void hudBanner.offsetWidth;
      hudBanner.classList.add("animal-letters-hud__banner--pop");
    } else {
      hudBanner.textContent = "";
      hudBanner.style.display = "none";
      hudBanner.classList.remove("animal-letters-hud__banner--pop");
    }
  }

  function resetWordState() {
    remaining = cloneMultiset(multisetFromWord(wordUpper()));
  }

  function cardHintTexture(): Texture | null {
    const id = animals[currentAnimalIndex()]!.id;
    return heroTextures.get(id) ?? coverTexture;
  }

  function syncTitle() {
    if (!titleSubNode || !titleMainNode) return;
    const animal = animals[currentAnimalIndex()]!;
    titleSubNode.text = "Найди буквы";
    titleMainNode.text = animal.word;
  }

  function applyHeaderTypography(width: number) {
    if (!titleSubNode || !titleMainNode) return;
    titleSubNode.style.wordWrapWidth = width - 16;
    titleSubNode.style.fontSize = width < 380 ? 14 : 16;
    titleSubNode.x = width / 2;
    titleSubNode.anchor.set(0.5, 0);
    titleSubNode.y = 8;

    const fsMain = Math.round(Math.min(62, Math.max(30, width * 0.115)));
    titleMainNode.style.fontSize = fsMain;
    titleMainNode.style.wordWrapWidth = width - 16;
    titleMainNode.x = width / 2;
    titleMainNode.anchor.set(0.5, 0);
    titleMainNode.y = titleSubNode.y + titleSubNode.height + 8;
  }

  function ensureHeroPin(): Container {
    if (!heroPin) {
      heroPin = new Container();
      heroPin.eventMode = "none";
      heroPad = new Graphics();
      heroSprite = new Sprite();
      heroSprite.eventMode = "none";
      heroPin.addChild(heroPad);
      heroPin.addChild(heroSprite);
    }
    return heroPin;
  }

  /** Нижняя граница шапки (Y), откуда начинается сетка карточек */
  function layoutHeaderBottom(width: number): number {
    applyHeaderTypography(width);
    if (!titleMainNode) return 96;

    let y = titleMainNode.y + titleMainNode.height + 14;
    const st = mainStage;
    const id = animals[currentAnimalIndex()]!.id;
    const tex = heroTextures.get(id);
    if (!tex || !st) {
      if (heroPin) heroPin.visible = false;
      return y + 10;
    }

    const pin = ensureHeroPin();
    heroSprite!.texture = tex;
    const maxH = Math.round(Math.min(132, Math.max(88, width * 0.38)));
    heroSprite!.scale.set(maxH / tex.height);
    const fw = heroSprite!.width;
    const fh = heroSprite!.height;
    const px = 12;
    const py = 12;
    heroPad!
      .clear()
      .roundRect(0, 0, fw + px * 2, fh + py * 2, 22)
      .fill({ color: 0xffffff, alpha: 0.96 })
      .stroke({ width: 2, color: 0xb8d9eb });
    heroSprite!.x = px;
    heroSprite!.y = py;
    pin.visible = true;
    if (pin.parent === st) st.removeChild(pin);
    const afterMain = st.getChildIndex(titleMainNode) + 1;
    st.addChildAt(pin, afterMain);
    pin.x = (width - pin.width) / 2;
    pin.y = y;
    return pin.y + pin.height + 14;
  }

  function syncTitleAndHeader(width: number): number {
    syncTitle();
    return layoutHeaderBottom(width);
  }

  function layout() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.min(640, Math.max(280, root.clientWidth || 320));
    const rowsHint = Math.min(5.2, 3.2 + rows * 0.22);
    const height = Math.round(Math.min(620, width * rowsHint));
    return { width, height, dpr };
  }

  function refreshFace(cell: Cell) {
    const parent = cell.face.parent;
    const idx = parent?.getChildIndex(cell.face) ?? 0;
    parent?.removeChild(cell.face);
    const hint = cell.faceUp ? null : cardHintTexture();
    const nf = makeCardFace(cell.cw, cell.ch, cell.model.letter, cell.faceUp, cell.locked, hint);
    nf.x = cell.face.x;
    nf.y = cell.face.y;
    nf.eventMode = "static";
    nf.cursor = cell.locked ? "default" : "pointer";
    nf.on("pointertap", (ev: FederatedPointerEvent) => {
      ev.stopPropagation();
      onCardTap(cell);
    });
    cell.face = nf;
    parent?.addChildAt(nf, idx);
  }

  function allWordRevealed(): boolean {
    const need = multisetFromWord(wordUpper());
    for (const [ch, n] of need) {
      let got = 0;
      for (const c of cells) {
        if (c.locked && c.model.letter === ch) got++;
      }
      if (got < n) return false;
    }
    return true;
  }

  function onCardTap(cell: Cell) {
    if (busy || cell.locked || !cell.face.eventMode) return;
    const L = cell.model.letter;
    const word = wordUpper();

    const need0 = multisetFromWord(word);
    if (!need0.has(L)) {
      cell.faceUp = true;
      refreshFace(cell);
      setHud("Другая буква");
      const letterShown = L;
      window.setTimeout(() => {
        if (destroyed) return;
        if (cell.model.letter !== letterShown) return;
        cell.faceUp = false;
        refreshFace(cell);
        setHud("");
      }, WRONG_LETTER_HOLD_MS);
      return;
    }

    if ((remaining.get(L) ?? 0) <= 0) {
      cell.faceUp = true;
      refreshFace(cell);
      setHud("Уже нашли");
      const letterShown = L;
      window.setTimeout(() => {
        if (destroyed) return;
        if (cell.model.letter !== letterShown) return;
        cell.faceUp = false;
        refreshFace(cell);
        setHud("");
      }, WRONG_LETTER_HOLD_MS);
      return;
    }

    cell.faceUp = true;
    cell.locked = true;
    remaining.set(L, (remaining.get(L) ?? 1) - 1);
    refreshFace(cell);
    setHud("");
    if (allWordRevealed()) void winWord();
  }

  function pulseTitle() {
    if (!titleMainNode) return;
    tweenProp(
      1,
      1.08,
      160,
      () => destroyed,
      (s) => titleMainNode!.scale.set(s),
      () => {
        tweenProp(1.08, 1, 180, () => destroyed, (s) => titleMainNode!.scale.set(s));
      },
    );
  }

  function miniSparkleOnGrid() {
    const st = mainStage;
    const L = layoutCache;
    if (!st || !L) return;
    const g = new Graphics();
    g.eventMode = "none";
    g.circle(L.gridCenterX, L.gridCenterY, 8).fill({ color: 0xffe066, alpha: 0.75 });
    st.addChild(g);
    tweenProp(
      1,
      2.4,
      320,
      () => destroyed,
      (s) => {
        g.scale.set(s);
        g.alpha = 0.75 - s * 0.22;
      },
      () => g.destroy(),
    );
  }

  function animateHeroCelebrate(): Promise<void> {
    const pin = heroPin;
    if (!pin || !pin.visible) {
      return new Promise((r) => window.setTimeout(r, 260));
    }
    const baseScaleX = pin.scale.x;
    const baseScaleY = pin.scale.y;
    const baseY = pin.y;
    return new Promise((resolve) => {
      tweenProp(
        0,
        1,
        380,
        () => destroyed,
        (v) => {
          const wave = Math.sin(v * Math.PI * 2.3);
          pin.scale.set(baseScaleX * (1 + 0.08 * Math.sin(v * Math.PI)), baseScaleY * (1 + 0.08 * Math.sin(v * Math.PI)));
          pin.rotation = 0.08 * wave * (1 - v * 0.65);
          pin.y = baseY - 10 * Math.sin(v * Math.PI);
        },
        () => {
          pin.scale.set(baseScaleX, baseScaleY);
          pin.rotation = 0;
          pin.y = baseY;
          resolve();
        },
      );
    });
  }

  async function winWord() {
    busy = true;
    const done = animals[currentAnimalIndex()]!;
    setHud("", { wordBanner: done.word });
    pulseTitle();
    miniSparkleOnGrid();
    void animateHeroCelebrate();

    await new Promise((r) => window.setTimeout(r, 620));
    if (destroyed) {
      busy = false;
      return;
    }

    const isLastWord = wordProgress >= animals.length - 1;
    if (isLastWord) {
      await completeLevelAnimation();
      busy = false;
      return;
    }

    wordProgress++;
    resetAllCardsForNewWord();
    const { width: rw, height: rh } = layout();
    const topNext = syncTitleAndHeader(rw);
    relayoutGridFromTop(rw, rh, topNext);
    setHud("");
    busy = false;
  }

  function resetAllCardsForNewWord() {
    for (const cell of cells) {
      cell.faceUp = false;
      cell.locked = false;
      refreshFace(cell);
    }
    resetWordState();
  }

  function advanceLevelData() {
    level++;
    wordProgress = 0;
    wordOrder = makeShuffledOrder((Date.now() ^ level * 0x9e37) | 0);
  }

  function relayoutGridFromTop(width: number, height: number, top: number) {
    if (cells.length === 0) return;
    const padX = 12;
    const bottomPad = 14;
    const gridH = height - top - bottomPad;
    const gap = 8;
    const cw = (width - padX * 2 - gap * (cols - 1)) / cols;
    const ch = (gridH - gap * (rows - 1)) / rows;
    const gx0 = padX + (cols * cw + (cols - 1) * gap) / 2;
    const gy0 = top + (rows * ch + (rows - 1) * gap) / 2;
    layoutCache = { width, padX, top, cw, ch, gap, cols, gridCenterX: gx0, gridCenterY: gy0 };

    fixedLetters.forEach((_, i) => {
      const cell = cells[i];
      if (!cell) return;
      const col = i % cols;
      const row = Math.floor(i / cols);
      cell.gridX = padX + col * (cw + gap);
      cell.gridY = top + row * (ch + gap);
      cell.cw = cw;
      cell.ch = ch;
      cell.face.x = cell.gridX;
      cell.face.y = cell.gridY;
      refreshFace(cell);
    });
  }

  async function completeLevelAnimation() {
    const st = mainStage;
    const L = layoutCache;
    if (!st || !L || cells.length === 0) {
      await startRound();
      return;
    }

    setHud("");
    playConfetti(st, L.gridCenterX, L.gridCenterY - 16, () => destroyed);

    const cx = L.gridCenterX;
    const cy = L.gridCenterY;
    const gatherMs = 400;

    await Promise.all(
      cells.map(
        (cell, i) =>
          new Promise<void>((resolve) => {
            const tx = cx + (i % cols) * 5 - (cols * 5) / 2;
            const ty = cy + Math.floor(i / cols) * 4 - (rows * 4) / 2;
            tweenXY(cell.face.x, cell.face.y, tx, ty, gatherMs, () => destroyed, (x, y) => {
              cell.face.x = x;
              cell.face.y = y;
            }, resolve);
          }),
      ),
    );
    if (destroyed) return;

    fixedLetters = reshuffleLetters(fixedLetters, (Date.now() ^ level * 0xface) | 0);
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]!;
      cell.model.letter = fixedLetters[i]!;
      cell.faceUp = false;
      cell.locked = false;
      refreshFace(cell);
    }

    advanceLevelData();
    resetWordState();
    const { width, height } = layout();
    const topNext = syncTitleAndHeader(width);
    relayoutGridFromTop(width, height, topNext);

    await new Promise((r) => window.setTimeout(r, 180));
    if (destroyed) return;

    await Promise.all(
      cells.map(
        (cell) =>
          new Promise<void>((resolve) => {
            tweenXY(cell.face.x, cell.face.y, cell.gridX, cell.gridY, 440, () => destroyed, (x, y) => {
              cell.face.x = x;
              cell.face.y = y;
            }, resolve);
          }),
      ),
    );
    if (destroyed) return;

    setHud("");
  }

  function requestManualNextLevel() {
    if (busy) return;
    void (async () => {
      busy = true;
      setHud("");
      await completeLevelAnimation();
      busy = false;
    })();
  }

  function wireApi() {
    if (api) api.nextLevel = requestManualNextLevel;
  }
  wireApi();

  async function relayoutOnly() {
    if (!app || destroyed || !mainStage || cells.length === 0 || !titleMainNode) return;
    const { width, height, dpr } = layout();
    await app.renderer.resize(width, height);
    app.renderer.resolution = dpr;
    app.canvas.style.width = `${width}px`;
    app.canvas.style.height = `${height}px`;

    if (fonBgSprite && fonTexture) {
      fonBgSprite.texture = fonTexture;
      fitCoverSprite(fonBgSprite, width, height);
    }
    if (bgGraphics) {
      bgGraphics.clear().rect(0, 0, width, height).fill({ color: BG, alpha: 0.78 });
    }

    const top = syncTitleAndHeader(width);
    const padX = 12;
    const bottomPad = 14;
    const gridH = height - top - bottomPad;
    const gap = 8;
    const cw = (width - padX * 2 - gap * (cols - 1)) / cols;
    const ch = (gridH - gap * (rows - 1)) / rows;
    const gx0 = padX + (cols * cw + (cols - 1) * gap) / 2;
    const gy0 = top + (rows * ch + (rows - 1) * gap) / 2;
    layoutCache = { width, padX, top, cw, ch, gap, cols, gridCenterX: gx0, gridCenterY: gy0 };

    fixedLetters.forEach((_, i) => {
      const cell = cells[i];
      if (!cell) return;
      const col = i % cols;
      const row = Math.floor(i / cols);
      cell.gridX = padX + col * (cw + gap);
      cell.gridY = top + row * (ch + gap);
      cell.cw = cw;
      cell.ch = ch;
      cell.face.x = cell.gridX;
      cell.face.y = cell.gridY;
      refreshFace(cell);
    });
  }

  async function startRound() {
    if (!app || destroyed) return;
    busy = true;
    app.stage.removeChildren();
    resetWordState();

    const { width, height, dpr } = layout();
    await app.renderer.resize(width, height);
    app.renderer.resolution = dpr;
    app.canvas.style.width = `${width}px`;
    app.canvas.style.height = `${height}px`;

    const stage = new Container();
    mainStage = stage;
    app.stage.addChild(stage);

    if (fonTexture) {
      if (!fonBgSprite) {
        fonBgSprite = new Sprite(fonTexture);
        fonBgSprite.eventMode = "none";
      }
      fitCoverSprite(fonBgSprite, width, height);
      stage.addChildAt(fonBgSprite, 0);
    }
    const bg = new Graphics().rect(0, 0, width, height).fill({ color: BG, alpha: fonTexture ? 0.78 : 1 });
    bg.eventMode = "none";
    bgGraphics = bg;
    stage.addChild(bg);

    titleSubNode = new Text({
      text: "",
      style: {
        fontFamily: "system-ui, Segoe UI, Roboto, sans-serif",
        fontSize: 15,
        fontWeight: "600",
        fill: 0x5a7a8a,
        align: "center",
        wordWrap: true,
        wordWrapWidth: width - 16,
      },
    });
    titleSubNode.eventMode = "none";

    titleMainNode = new Text({
      text: "",
      style: {
        fontFamily: "system-ui, Segoe UI, Roboto, sans-serif",
        fontSize: 40,
        fontWeight: "800",
        fill: ACCENT,
        align: "center",
        wordWrap: true,
        wordWrapWidth: width - 16,
      },
    });
    titleMainNode.eventMode = "none";

    stage.addChild(titleSubNode);
    stage.addChild(titleMainNode);

    const top = syncTitleAndHeader(width);

    const padX = 12;
    const bottomPad = 14;
    const gridH = height - top - bottomPad;
    const gap = 8;
    const cw = (width - padX * 2 - gap * (cols - 1)) / cols;
    const ch = (gridH - gap * (rows - 1)) / rows;

    const gx0 = padX + (cols * cw + (cols - 1) * gap) / 2;
    const gy0 = top + (rows * ch + (rows - 1) * gap) / 2;
    layoutCache = { width, padX, top, cw, ch, gap, cols, gridCenterX: gx0, gridCenterY: gy0 };

    cells = [];

    fixedLetters.forEach((letter, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = padX + col * (cw + gap);
      const y = top + row * (ch + gap);

      const model: TileModel = { id: i, letter };
      const face = makeCardFace(cw, ch, letter, false, false, cardHintTexture());
      face.x = x;
      face.y = y;
      face.eventMode = "static";
      face.cursor = "pointer";

      const cell: Cell = { model, face, faceUp: false, locked: false, cw, ch, gridX: x, gridY: y };
      cells.push(cell);

      face.on("pointertap", (ev: FederatedPointerEvent) => {
        ev.stopPropagation();
        onCardTap(cell);
      });

      stage.addChild(face);
    });

    setHud("");
    busy = false;
  }

  void Assets.load<Texture>(COVER_URL)
    .then((tex) => {
      if (destroyed) return;
      coverTexture = tex;
      if (cells.length) void relayoutOnly();
    })
    .catch(() => {});

  void Assets.load<Texture>(FON_URL)
    .then((tex) => {
      if (destroyed) return;
      fonTexture = tex;
      if (mainStage && bgGraphics) {
        const { width, height } = layout();
        if (!fonBgSprite) {
          fonBgSprite = new Sprite(tex);
          fonBgSprite.eventMode = "none";
          mainStage.addChildAt(fonBgSprite, 0);
        } else {
          fonBgSprite.texture = tex;
        }
        fitCoverSprite(fonBgSprite, width, height);
        bgGraphics.clear().rect(0, 0, width, height).fill({ color: BG, alpha: 0.78 });
        if (cells.length) void relayoutOnly();
      }
    })
    .catch(() => {});

  for (const [id, url] of Object.entries(HERO_ASSETS)) {
    void Assets.load<Texture>(url)
      .then((tex) => {
        if (destroyed) return;
        heroTextures.set(id, tex);
        if (mainStage && cells.length > 0) void relayoutOnly();
      })
      .catch(() => {});
  }

  let resizeDebounce: number | null = null;
  let lastLayoutW = 0;
  let lastLayoutH = 0;
  const ro = new ResizeObserver(() => {
    if (!app || destroyed) return;
    if (resizeDebounce !== null) window.clearTimeout(resizeDebounce);
    resizeDebounce = window.setTimeout(() => {
      resizeDebounce = null;
      if (destroyed) return;
      const { width: lw, height: lh } = layout();
      if (
        cells.length > 0 &&
        Math.abs(lw - lastLayoutW) < 8 &&
        Math.abs(lh - lastLayoutH) < 8
      ) {
        return;
      }
      lastLayoutW = lw;
      lastLayoutH = lh;
      if (busy) return;
      if (cells.length > 0) void relayoutOnly();
      else void startRound();
    }, 280);
  });
  ro.observe(root);

  void (async () => {
    const { width, height, dpr } = layout();
    app = new Application();
    await app.init({
      width,
      height,
      backgroundAlpha: 0,
      antialias: true,
      resolution: dpr,
      autoDensity: true,
    });
    if (destroyed) {
      app.destroy(true);
      return;
    }
    canvasHost.appendChild(app.canvas);
    await startRound();
    wireApi();
  })();

  return () => {
    destroyed = true;
    if (resizeDebounce !== null) window.clearTimeout(resizeDebounce);
    if (api) api.nextLevel = () => {};
    ro.disconnect();
    heroPin?.destroy({ children: true });
    heroPin = null;
    heroPad = null;
    heroSprite = null;
    heroTextures.clear();
    coverTexture = null;
    fonTexture = null;
    fonBgSprite?.destroy();
    fonBgSprite = null;
    app?.destroy(true);
    app = null;
    root.remove();
  };
}
