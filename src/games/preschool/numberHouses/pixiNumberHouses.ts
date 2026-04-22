import { Application, Assets, Container, FederatedPointerEvent, Graphics, Sprite, Text, Texture } from "pixi.js";

type Difficulty = "easy" | "medium";

type Opts = {
  host: HTMLElement;
  difficulty: Difficulty;
};

const BG = 0xfff5e8;
const BRICK = 0xffd9a8;
const HOUSE = 0xe8d4ff;
const ROOF = 0xc9b6ff;
const ACCENT = 0x5a3d7a;
const OK = 0x7dd96f;
const WINDOW_BG = 0xfffdf8;
const WINDOW_FRAME = 0xa894c4;
const FLOOR_OK = 0xd4f5e9;
const FON_URL = `${import.meta.env.BASE_URL}games/number-houses/fon-gorod.png`;

function fitCoverSprite(s: Sprite, w: number, h: number) {
  const tw = s.texture.width;
  const th = s.texture.height;
  const sc = Math.max(w / tw, h / th);
  s.scale.set(sc);
  s.anchor.set(0.5);
  s.x = w / 2;
  s.y = h / 2;
}

function pairsForSum(target: number): [number, number][] {
  const out: [number, number][] = [];
  for (let a = 0; a <= target; a++) {
    const b = target - a;
    if (b < a) break;
    out.push([a, b]);
  }
  return out;
}

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

function makeBrick(n: number, w: number, h: number, disabled: boolean): Container {
  const c = new Container();
  const g = new Graphics();
  const fill = disabled ? 0xd0d0d0 : BRICK;
  g.roundRect(0, 0, w, h, 12).fill({ color: fill });
  g.roundRect(0, 0, w, h, 12).stroke({ width: 2, color: 0xccaa88 });
  c.addChild(g);
  const t = new Text({
    text: String(n),
    style: {
      fontFamily: "system-ui, Segoe UI, Roboto, sans-serif",
      fontSize: Math.min(w, h) * 0.45,
      fontWeight: "800",
      fill: disabled ? 0x777777 : 0x3a2a1f,
    },
  });
  t.anchor.set(0.5);
  t.x = w / 2;
  t.y = h / 2;
  c.addChild(t);
  return c;
}

function makeWindowFrame(w: number, h: number): Container {
  const c = new Container();
  const g = new Graphics();
  g.roundRect(0, 0, w, h, 10).fill({ color: WINDOW_BG, alpha: 1 });
  g.roundRect(0, 0, w, h, 10).stroke({ width: 3, color: WINDOW_FRAME });
  c.addChild(g);
  const q = new Text({
    text: "?",
    style: {
      fontFamily: "system-ui, Segoe UI, Roboto, sans-serif",
      fontSize: Math.min(w, h) * 0.38,
      fontWeight: "700",
      fill: 0xc4b8d4,
    },
  });
  q.anchor.set(0.5);
  q.x = w / 2;
  q.y = h / 2;
  c.addChild(q);
  return c;
}

function playConfetti(stage: Container, cx: number, cy: number, isDead: () => boolean) {
  const colors = [0xff6b9d, 0xffd569, 0x7dd96f, 0x6bcfff, 0xc78cff, 0xff9f6e];
  type P = { g: Graphics; vx: number; vy: number; ay: number };
  const pieces: P[] = [];
  for (let i = 0; i < 48; i++) {
    const g = new Graphics();
    g.roundRect(-3, -4, 6, 8, 2).fill({ color: colors[i % colors.length]! });
    g.x = cx;
    g.y = cy;
    const ang = (Math.PI * 2 * i) / 48 + Math.random() * 0.4;
    const sp = 2.8 + Math.random() * 5;
    pieces.push({
      g,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp - 3,
      ay: 0.16,
    });
    stage.addChild(g);
  }
  const t0 = performance.now();
  function tick(now: number) {
    if (isDead()) {
      for (const p of pieces) p.g.destroy();
      return;
    }
    const t = now - t0;
    if (t > 950) {
      for (const p of pieces) p.g.destroy();
      return;
    }
    for (const p of pieces) {
      p.vy += p.ay;
      p.g.x += p.vx;
      p.g.y += p.vy;
      p.g.rotation += 0.09;
      p.g.alpha = Math.max(0, 1 - t / 950);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

type BrickModel = { id: number; n: number; used: boolean };

type HouseState = {
  target: number;
  bricks: BrickModel[];
  usedPairs: Set<string>;
  placed: [number | null, number | null];
  /** Этаж j = вариант пары (как в pairsForSum); заполняется при успехе */
  floorFilled: (null | { a: number; b: number })[];
};

export function mountNumberHouses(opts: Opts): () => void {
  let nextBrickId = 1;
  const { host, difficulty } = opts;
  let destroyed = false;
  let app: Application | null = null;
  let rngSeed = (Date.now() / 1000) | 0;

  const easySequence = [3, 4, 5, 6, 7, 8, 9, 10] as const;
  const mediumSequence = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20] as const;
  let orderedIndex = 0;
  let afterOrderedRandom = false;

  let house: HouseState | null = null;
  let fonTexture: Texture | null = null;

  const root = document.createElement("div");
  root.style.width = "100%";
  host.appendChild(root);

  const canvasHost = document.createElement("div");
  canvasHost.style.width = "100%";
  root.appendChild(canvasHost);

  const hud = document.createElement("div");
  hud.style.cssText =
    "margin-top:10px;font-size:15px;line-height:1.45;opacity:.9;text-align:center;min-height:2.8em;";
  root.appendChild(hud);

  function setHud(text: string) {
    hud.textContent = text;
  }

  function pairKey(a: number, b: number): string {
    return a <= b ? `${a}-${b}` : `${b}-${a}`;
  }

  function pickNextTarget(): number {
    if (difficulty === "easy") {
      if (!afterOrderedRandom && orderedIndex < easySequence.length) {
        return easySequence[orderedIndex]!;
      }
      afterOrderedRandom = true;
      return 3 + Math.floor(mulberry32(++rngSeed)() * 8);
    }
    if (!afterOrderedRandom && orderedIndex < mediumSequence.length) {
      return mediumSequence[orderedIndex]!;
    }
    afterOrderedRandom = true;
    return 11 + Math.floor(mulberry32(++rngSeed)() * 10);
  }

  function startNewHouseRound() {
    const target = pickNextTarget();
    const rng = mulberry32(++rngSeed);
    const pairs = pairsForSum(target);
    const needList: number[] = [];
    for (const [a, b] of pairs) {
      needList.push(a, b);
    }
    const extras: number[] = [];
    const extraCount = difficulty === "medium" ? 4 : 2;
    for (let i = 0; i < extraCount; i++) {
      if (difficulty === "easy") {
        extras.push(Math.floor(rng() * 11));
      } else {
        extras.push(Math.floor(rng() * Math.max(target + 6, 12)));
      }
    }
    const values = shuffle([...needList, ...extras], rng);
    const bricks: BrickModel[] = values.map((n) => ({
      id: nextBrickId++,
      n,
      used: false,
    }));

    house = {
      target,
      bricks,
      usedPairs: new Set(),
      placed: [null, null],
      floorFilled: pairs.map(() => null),
    };
  }

  function tryCommitPair(a: number, b: number): boolean {
    if (!house) return false;
    if (a + b !== house.target) return false;
    const key = pairKey(a, b);
    if (house.usedPairs.has(key)) {
      setHud("Эту пару мы уже нашли. Попробуй другую.");
      return false;
    }
    house.usedPairs.add(key);
    return true;
  }

  type Geo = {
    houseW: number;
    hx: number;
    hy: number;
    wallTop: number;
    winW: number;
    winH: number;
    win1x: number;
    win2x: number;
    activeWinsY: number;
    stripH: number;
    stackH: number;
    pairs: [number, number][];
  };

  function layoutGeometry(width: number, target: number): Geo {
    const pairs = pairsForSum(target);
    const houseW = Math.min(248, width * 0.62);
    const hx = (width - houseW) / 2;
    const hy = 28;
    const wallTop = hy + 36;
    const stripH = Math.min(26, Math.max(17, 110 / Math.max(pairs.length, 1)));
    const stackH = pairs.length * stripH + 6;
    const winW = Math.min(74, houseW * 0.31);
    const winH = 50;
    const gapWin = Math.min(16, houseW * 0.07);
    const win1x = hx + (houseW - winW * 2 - gapWin) / 2;
    const win2x = win1x + winW + gapWin;
    const activeWinsY = wallTop + stackH + 6;
    return { houseW, hx, hy, wallTop, winW, winH, win1x, win2x, activeWinsY, stripH, stackH, pairs };
  }

  function hitWindow(localX: number, localY: number, g: Geo, which: 0 | 1): boolean {
    const x = which === 0 ? g.win1x : g.win2x;
    const pad = 12;
    const y = g.activeWinsY;
    return (
      localX >= x - pad &&
      localX <= x + g.winW + pad &&
      localY >= y - pad &&
      localY <= y + g.winH + pad
    );
  }

  async function render() {
    if (!app || destroyed || !house) return;
    app.stage.removeChildren();

    const width = Math.min(640, Math.max(280, root.clientWidth || 320));
    const height = Math.min(580, Math.round(width * 1.06));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    await app.renderer.resize(width, height);
    app.renderer.resolution = dpr;
    app.canvas.style.width = `${width}px`;
    app.canvas.style.height = `${height}px`;

    const stage = new Container();
    app.stage.addChild(stage);
    stage.eventMode = "static";
    stage.hitArea = app.screen;

    if (fonTexture) {
      const bgPhoto = new Sprite(fonTexture);
      bgPhoto.eventMode = "none";
      fitCoverSprite(bgPhoto, width, height);
      stage.addChild(bgPhoto);
    }
    stage.addChild(new Graphics().rect(0, 0, width, height).fill({ color: BG, alpha: fonTexture ? 0.76 : 1 }));

    const geo = layoutGeometry(width, house.target);
    const { houseW, hx, hy, wallTop, winW, winH, win1x, win2x, activeWinsY, stripH, stackH, pairs } = geo;

    const wallBottom = activeWinsY + winH + 14;
    const wallH = wallBottom - wallTop;

    const roof = new Graphics();
    roof.moveTo(houseW / 2, 0).lineTo(houseW, 40).lineTo(0, 40).closePath().fill({ color: ROOF });
    roof.x = hx;
    roof.y = hy;
    stage.addChild(roof);

    const walls = new Graphics();
    walls.roundRect(0, 0, houseW, wallH, 10).fill({ color: HOUSE });
    walls.roundRect(0, 0, houseW, wallH, 10).stroke({ width: 2, color: 0xb59fd9 });
    walls.x = hx;
    walls.y = wallTop;
    stage.addChild(walls);

    for (let j = 0; j < pairs.length; j++) {
      const fy = wallTop + 6 + j * stripH;
      const filled = house.floorFilled[j];
      const band = new Graphics();
      band.roundRect(hx + 8, fy, houseW - 16, stripH - 4, 6).fill({
        color: filled ? FLOOR_OK : 0xf3edfc,
        alpha: filled ? 0.95 : 0.65,
      });
      band.roundRect(hx + 8, fy, houseW - 16, stripH - 4, 6).stroke({
        width: 1,
        color: filled ? 0x6bc9a8 : 0xd0c4e8,
      });
      stage.addChild(band);
      const label = filled
        ? `${filled.a} + ${filled.b} = ${house.target} ✓`
        : `Этаж ${j + 1} — найди пару`;
      const tt = new Text({
        text: label,
        style: {
          fontFamily: "system-ui, Segoe UI, Roboto, sans-serif",
          fontSize: Math.min(14, stripH - 8),
          fontWeight: filled ? "700" : "600",
          fill: filled ? 0x1a5c44 : 0x8a79a8,
        },
      });
      tt.anchor.set(0.5, 0.5);
      tt.x = hx + houseW / 2;
      tt.y = fy + (stripH - 4) / 2;
      stage.addChild(tt);
    }

    const wf0 = makeWindowFrame(winW, winH);
    wf0.x = win1x;
    wf0.y = activeWinsY;
    stage.addChild(wf0);

    const wf1 = makeWindowFrame(winW, winH);
    wf1.x = win2x;
    wf1.y = activeWinsY;
    stage.addChild(wf1);

    const plus = new Text({
      text: "+",
      style: {
        fontFamily: "system-ui, Segoe UI, Roboto, sans-serif",
        fontSize: 22,
        fontWeight: "800",
        fill: 0x8a79a8,
      },
    });
    plus.anchor.set(0.5);
    plus.x = win1x + winW + (win2x - (win1x + winW)) / 2;
    plus.y = activeWinsY + winH / 2;
    stage.addChild(plus);

    const roofNum = new Text({
      text: String(house.target),
      style: {
        fontFamily: "system-ui, Segoe UI, Roboto, sans-serif",
        fontSize: 34,
        fontWeight: "900",
        fill: ACCENT,
      },
    });
    roofNum.anchor.set(0.5);
    roofNum.x = hx + houseW / 2;
    roofNum.y = hy + 22;
    stage.addChild(roofNum);

    const cap = difficulty === "easy" ? easySequence.length : mediumSequence.length;
    const phaseHint = afterOrderedRandom
      ? difficulty === "easy"
        ? "Теперь числа 3–10 в случайном порядке."
        : "Теперь числа 11–20 в случайном порядке."
      : `Учимся по шагам: ${orderedIndex + 1} из ${cap}`;

    const hint = new Text({
      text: `Этажи — все пары для числа ${house.target}. Внизу перетащи кирпичики в окошки.`,
      style: {
        fontFamily: "system-ui, Segoe UI, Roboto, sans-serif",
        fontSize: 13,
        fontWeight: "600",
        fill: 0x6a5a72,
        align: "center",
        wordWrap: true,
        wordWrapWidth: width - 24,
      },
    });
    hint.anchor.set(0.5, 0);
    hint.x = width / 2;
    hint.y = wallBottom + 10;
    stage.addChild(hint);

    const phaseText = new Text({
      text: phaseHint,
      style: {
        fontFamily: "system-ui, Segoe UI, Roboto, sans-serif",
        fontSize: 12,
        fontWeight: "600",
        fill: 0x9180a0,
        align: "center",
        wordWrap: true,
        wordWrapWidth: width - 24,
      },
    });
    phaseText.anchor.set(0.5, 0);
    phaseText.x = width / 2;
    phaseText.y = hint.y + hint.height + 6;
    stage.addChild(phaseText);

    const models = house.bricks;
    const activeModels = models.filter((m) => !m.used);
    const bw = Math.min(56, (width - 24) / Math.max(1, activeModels.length) - 6);
    const bh = Math.min(52, bw + 4);
    const gap = 8;
    const rowW = activeModels.length * bw + (activeModels.length - 1) * gap;
    const x0 = (width - rowW) / 2;
    const y0 = height - bh - 22;

    const winCenter = (wx: number) => ({
      x: wx + winW / 2 - bw / 2,
      y: activeWinsY + winH / 2 - bh / 2,
    });

    const brickById = new Map<number, BrickModel>();
    for (const m of models) brickById.set(m.id, m);

    let drag: { id: number; offsetX: number; offsetY: number } | null = null;

    models.forEach((m) => {
      if (m.used) return;

      const stripIndex = activeModels.findIndex((b) => b.id === m.id);
      const homeX = stripIndex >= 0 ? x0 + stripIndex * (bw + gap) : x0;
      const homeY = y0;
      let px = homeX;
      let py = homeY;
      if (house!.placed[0] === m.id) {
        const c = winCenter(win1x);
        px = c.x;
        py = c.y;
      } else if (house!.placed[1] === m.id) {
        const c = winCenter(win2x);
        px = c.x;
        py = c.y;
      }

      const cont = makeBrick(m.n, bw, bh, m.used);
      cont.x = px;
      cont.y = py;

      if (!m.used) {
        cont.eventMode = "static";
        cont.cursor = "grab";
        cont.on("pointerdown", (ev: FederatedPointerEvent) => {
          if (m.used || destroyed) return;
          drag = { id: m.id, offsetX: ev.globalX - cont.x, offsetY: ev.globalY - cont.y };
          cont.cursor = "grabbing";
          stage.on("pointermove", onMove);
          stage.on("pointerup", onUp);
          stage.on("pointerupoutside", onUp);
        });
      } else {
        cont.alpha = 0.35;
        cont.eventMode = "none";
      }

      (cont as Container & { __bid?: number }).__bid = m.id;

      stage.addChild(cont);
    });

    function onMove(ev: FederatedPointerEvent) {
      if (!drag) return;
      const id = drag.id;
      const cont = stage.children.find((ch) => (ch as Container & { __bid?: number }).__bid === id) as
        | Container
        | undefined;
      if (!cont) return;
      cont.x = ev.globalX - drag.offsetX;
      cont.y = ev.globalY - drag.offsetY;
    }

    function findContByBrickId(id: number): Container | undefined {
      return stage.children.find((ch) => (ch as Container & { __bid?: number }).__bid === id) as
        | Container
        | undefined;
    }

    function onUp(ev: FederatedPointerEvent) {
      if (!drag || !house) return;
      stage.off("pointermove", onMove);
      stage.off("pointerup", onUp);
      stage.off("pointerupoutside", onUp);
      const brickId = drag.id;
      drag = null;
      const cont = findContByBrickId(brickId);
      if (cont) cont.cursor = "grab";

      const model = brickById.get(brickId);
      if (!model || model.used) return;

      const local = ev.getLocalPosition(stage);
      const inWin0 = hitWindow(local.x, local.y, geo, 0);
      const inWin1 = hitWindow(local.x, local.y, geo, 1);

      if (!inWin0 && !inWin1) {
        if (house.placed[0] === brickId) house.placed[0] = null;
        else if (house.placed[1] === brickId) house.placed[1] = null;
        animateTo(findContByBrickId(brickId), homePos(model.id));
        return;
      }

      const slot: 0 | 1 = inWin0 ? 0 : 1;
      const occupant = house.placed[slot];

      if (occupant !== null && occupant !== brickId) {
        animateTo(findContByBrickId(brickId), homePos(model.id));
        return;
      }

      if (house.placed[0] === brickId || house.placed[1] === brickId) {
        const wx = house.placed[0] === brickId ? win1x : win2x;
        magnetTo(findContByBrickId(brickId), winCenter(wx));
        return;
      }

      house.placed[slot] = brickId;
      magnetTo(findContByBrickId(brickId), winCenter(slot === 0 ? win1x : win2x));

      const id0 = house.placed[0];
      const id1 = house.placed[1];
      if (id0 === null || id1 === null) {
        setHud(slot === 0 ? "Теперь второй кирпичик — в правое окошко." : "Поставь число и в левое окошко.");
        return;
      }

      const b0 = brickById.get(id0)!;
      const b1 = brickById.get(id1)!;
      house.placed[0] = null;
      house.placed[1] = null;

      if (!tryCommitPair(b0.n, b1.n)) {
        setHud("Вместе не получится это число. Попробуй другие.");
        animateTo(findContByBrickId(b0.id), homePos(b0.id));
        animateTo(findContByBrickId(b1.id), homePos(b1.id));
        void render();
        return;
      }

      const pi = pairs.findIndex(([x, y]) => pairKey(x, y) === pairKey(b0.n, b1.n));
      if (pi >= 0) {
        house.floorFilled[pi] = { a: Math.min(b0.n, b1.n), b: Math.max(b0.n, b1.n) };
      }

      playConfetti(stage, win1x + winW + (win2x - win1x - winW) / 2, activeWinsY + winH / 2, () => destroyed);
      flashPulse(stage, width / 2, activeWinsY + winH / 2);

      b0.used = true;
      b1.used = true;
      setHud("Супер! Эта пара подошла.");

      const allKeys = new Set(pairs.map(([x, y]) => pairKey(x, y)));
      const done = [...allKeys].every((k) => house!.usedPairs.has(k));
      if (done) {
        window.setTimeout(() => {
          if (destroyed) return;
          if (!afterOrderedRandom) {
            orderedIndex++;
            const lim = difficulty === "easy" ? easySequence.length : mediumSequence.length;
            if (orderedIndex >= lim) {
              afterOrderedRandom = true;
              setHud("Отлично! Дальше — случайные числа для закрепления.");
            } else {
              setHud("Следующий домик…");
            }
          } else {
            setHud("Следующий домик…");
          }
          startNewHouseRound();
          void render();
        }, 750);
      } else {
        void render();
      }
    }

    function homePos(id: number): { x: number; y: number } {
      const m = brickById.get(id);
      if (!m || m.used) return { x: x0, y: y0 };
      const si = activeModels.findIndex((b) => b.id === id);
      if (si < 0) return { x: x0, y: y0 };
      return { x: x0 + si * (bw + gap), y: y0 };
    }

    function magnetTo(c: Container | undefined, pos: { x: number; y: number }) {
      if (!c) return;
      const sx = c.x;
      const sy = c.y;
      const t0 = performance.now();
      const dur = 160;
      const tick = (now: number) => {
        if (destroyed) return;
        const u = Math.min(1, (now - t0) / dur);
        const e = 1 - (1 - u) ** 3;
        c.x = sx + (pos.x - sx) * e;
        c.y = sy + (pos.y - sy) * e;
        if (u < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    function animateTo(c: Container | undefined, target: { x: number; y: number }) {
      if (!c) return;
      const sx = c.x;
      const sy = c.y;
      const t0 = performance.now();
      const dur = 220;
      const tick = (now: number) => {
        if (destroyed) return;
        const u = Math.min(1, (now - t0) / dur);
        const e = 1 - (1 - u) ** 3;
        c.x = sx + (target.x - sx) * e;
        c.y = sy + (target.y - sy) * e;
        if (u < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    function flashPulse(stage: Container, cx: number, cy: number) {
      const g = new Graphics();
      g.circle(cx, cy, 10).fill({ color: OK, alpha: 0.45 });
      stage.addChild(g);
      const t0 = performance.now();
      function pulse(now: number) {
        if (destroyed) {
          g.destroy();
          return;
        }
        const u = (now - t0) / 400;
        if (u >= 1) {
          g.destroy();
          return;
        }
        g.scale.set(1 + u * 2.2);
        g.alpha = 0.45 * (1 - u);
        requestAnimationFrame(pulse);
      }
      requestAnimationFrame(pulse);
    }

    setHud("Сложи число на крыше из двух кирпичиков в окошках.");
  }

  const ro = new ResizeObserver(() => {
    if (app && !destroyed && house) void render();
  });
  ro.observe(root);

  void (async () => {
    const width = Math.min(640, Math.max(280, root.clientWidth || 320));
    const height = Math.min(580, Math.round(width * 1.06));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
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
    void Assets.load<Texture>(FON_URL)
      .then((tex) => {
        if (destroyed) return;
        fonTexture = tex;
        if (house) void render();
      })
      .catch(() => {});
    orderedIndex = 0;
    afterOrderedRandom = false;
    startNewHouseRound();
    await render();
  })();

  return () => {
    destroyed = true;
    ro.disconnect();
    fonTexture = null;
    void Assets.unload(FON_URL).catch(() => {});
    app?.destroy(true);
    app = null;
    root.remove();
  };
}
