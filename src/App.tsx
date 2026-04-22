import { useState } from "preact/hooks";
import { AnimalLettersScreen } from "./games/preschool/AnimalLettersScreen";
import { NumberHousesScreen } from "./games/preschool/NumberHousesScreen";

type Route = "home" | "animal-letters" | "number-houses";

export function App() {
  const [route, setRoute] = useState<Route>("home");

  if (route === "animal-letters") {
    return (
      <div class="shell">
        <AnimalLettersScreen onBack={() => setRoute("home")} />
      </div>
    );
  }

  if (route === "number-houses") {
    return (
      <div class="shell">
        <NumberHousesScreen onBack={() => setRoute("home")} />
      </div>
    );
  }

  return (
    <div class="shell">
      <h1>Игра-развивашка</h1>
      <p class="sub">Дошкольники (4–6 лет) — выберите игру</p>
      <div class="cards">
        <button type="button" class="game-card game-card--zverobukvy" onClick={() => setRoute("animal-letters")}>
          <h2>ЗвероБуквы</h2>
          <p>Найди буквы слова-зверя. Как в мемори, но буквы из слова остаются открытыми.</p>
        </button>
        <button type="button" class="game-card" onClick={() => setRoute("number-houses")}>
          <h2>Домики чисел</h2>
          <p>Сложи число из пары кирпичиков: перетащи два числа к дому.</p>
        </button>
      </div>
    </div>
  );
}
