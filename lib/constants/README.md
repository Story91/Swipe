# Share Texts - Dokumentacja

## 📝 Opis

Plik `share-texts.ts` zawiera wszystkie teksty do udostępniania predykcji w aplikacji. Dzięki centralizacji treści, łatwo można dodawać nowe warianty i zarządzać nimi w jednym miejscu.

## 🎯 Dostępne funkcje

### 1. Udostępnienie po obstawieniu zakładu

```typescript
import { buildStakeShareText } from '@/lib/constants/share-texts';

const { text, url } = buildStakeShareText(
  "Will BTC reach $100k by EOY?",  // pytanie predykcji
  "0.001",                          // sformatowana kwota
  "ETH",                            // token (ETH lub SWIPE)
  "https://theswipe.app/pred_123"  // URL predykcji (opcjonalny)
);
```

**Losuje z:**
- 15 wariantów intro (np. "🎯 I just bet on SWIPE!")
- 15 wariantów outro (np. "WDYT? 👀")
- 15 wariantów CTA (np. "Check it out:")

**Przykładowy wynik:**
```
💰 Just placed my bet on SWIPE!

"Will BTC reach $100k by EOY?"

💰 My bet: 0.001 ETH

What's your take? 👀

View prediction:
```

---

### 2. Udostępnienie bieżącej predykcji (przed zakładem)

```typescript
import { buildCurrentPredictionShareText } from '@/lib/constants/share-texts';

const { text, includeStats } = buildCurrentPredictionShareText(
  "Will ETH flip BTC?",   // pytanie
  1.5,                     // pool ETH (opcjonalny)
  250000,                  // pool SWIPE (opcjonalny)
  42                       // liczba uczestników (opcjonalna)
);
```

**Losuje z:**
- 15 wariantów intro (np. "👀 Just found this on SWIPE:")
- 15 wariantów outro (np. "Swipe to predict! 🎯")

**Przykładowy wynik:**
```
🎯 This prediction goes hard:

"Will ETH flip BTC?"

💰 ETH Pool: 1.5000 ETH
🎯 SWIPE Pool: 250K
👥 42 swipers

Make your prediction! 💰
```

---

### 3. Funkcje pomocnicze

#### Losowanie pojedynczych elementów

```typescript
import { 
  getRandomStakeIntro,
  getRandomStakeOutro,
  getRandomStakeCTA,
  getRandomCurrentPredictionIntro,
  getRandomCurrentPredictionOutro,
  getRandomWinIntro,
  getRandomLossIntro,
  getRandomActivePredictionIntro,
  getRandomStatsIntro
} from '@/lib/constants/share-texts';

// Przykłady:
const intro = getRandomStakeIntro();
// => "🎯 I just bet on SWIPE!"

const outro = getRandomStakeOutro();
// => "WDYT? 👀"

const cta = getRandomStakeCTA();
// => "Check it out:"
```

#### Tagi platform

```typescript
import { getPlatformTag } from '@/lib/constants/share-texts';

const tag = getPlatformTag('farcaster');
// => "@swipeai"

const twitterTag = getPlatformTag('twitter');
// => "@swipe_ai_"
```

#### Formatowanie

```typescript
import { formatSwipeAmount, formatTimeLeft } from '@/lib/constants/share-texts';

const formatted = formatSwipeAmount(1500000);
// => "1.5M"

const timeLeft = formatTimeLeft(1736500000); // timestamp
// => "2d 5h"
```

---

## 📚 Dostępne tablice tekstów

### Stake Share (po obstawieniu)
- `STAKE_SHARE_INTROS` - 15 wariantów intro
- `STAKE_SHARE_OUTROS` - 15 wariantów outro
- `STAKE_SHARE_CALLS_TO_ACTION` - 15 wariantów CTA

### Current Prediction (przed zakładem)
- `CURRENT_PREDICTION_INTROS` - 15 wariantów intro
- `CURRENT_PREDICTION_OUTROS` - 15 wariantów outro

### Win/Loss (po rozwiązaniu)
- `WIN_SHARE_INTROS` - 15 wariantów dla wygranych
- `LOSS_SHARE_INTROS` - 15 wariantów dla przegranych

### Active Prediction (użytkownik już obstawił)
- `ACTIVE_PREDICTION_INTROS` - 15 wariantów intro

### Stats Share (portfolio)
- `STATS_WIN_INTROS` - 10 wariantów dla zysków
- `STATS_LOSS_INTROS` - 10 wariantów dla strat

---

## ➕ Jak dodać nowe teksty?

1. Otwórz `lib/constants/share-texts.ts`
2. Znajdź odpowiednią tablicę (np. `STAKE_SHARE_INTROS`)
3. Dodaj nowy tekst do tablicy:

```typescript
export const STAKE_SHARE_INTROS = [
  "🎯 I just bet on SWIPE!",
  "💰 Just placed my bet on SWIPE!",
  // ... istniejące
  "🔥 Twój nowy tekst tutaj!" // <- dodaj tutaj
];
```

4. Zapisz plik - zmiany będą automatycznie dostępne w całej aplikacji!

---

## 🎨 Przykłady użycia w komponentach

### TinderCard.tsx

```typescript
import { buildStakeShareText } from '../../../lib/constants/share-texts';

// Po obstawieniu zakładu
const { text: shareText } = buildStakeShareText(
  predictionText,
  formattedAmount,
  token,
  predictionUrl
);
```

### EnhancedUserDashboard.tsx

```typescript
import { getRandomStatsIntro, getPlatformTag } from '@/lib/constants/share-texts';

// Udostępnianie statystyk
const intro = getRandomStatsIntro(isProfit, platform);
// => "🏆 Crushing it on @swipeai"
```

### LegacyCard.tsx

```typescript
import { getRandomWinIntro, getRandomLossIntro, getPlatformTag } from '@/lib/constants/share-texts';

// Po rozwiązaniu predykcji
const intro = isWinner 
  ? getRandomWinIntro()
  : getRandomLossIntro();
```

---

## ✅ Zalety tego rozwiązania

1. **Centralizacja** - wszystkie teksty w jednym miejscu
2. **Łatwa edycja** - dodaj/usuń warianty bez dotykania logiki komponentów
3. **Konsystencja** - te same funkcje używane w całej aplikacji
4. **Skalowalność** - łatwo dodać nowe typy udostępniania
5. **Testowanie** - łatwo testować funkcje niezależnie
6. **TypeScript** - pełne wsparcie typów i autocomplete

---

## 🔄 Migracja istniejącego kodu

Jeśli masz stare teksty bezpośrednio w komponentach:

**Przed:**
```typescript
const shareText = `🎯 I just bet on SWIPE!\n\n"${prediction}"\n\nWDYT?`;
```

**Po:**
```typescript
import { buildStakeShareText } from '@/lib/constants/share-texts';

const { text: shareText } = buildStakeShareText(
  prediction,
  amount,
  token,
  url
);
```

---

## 📊 Statystyki

- **Stake Share**: 15 intro × 15 outro × 15 CTA = **3,375 unikalnych kombinacji**
- **Current Prediction**: 15 intro × 15 outro = **225 kombinacji**
- **Win/Loss**: 15 + 15 = **30 wariantów**
- **Łącznie**: Ponad **3,600 unikalnych wersji tekstów!** 🎉

---

## 🛠️ Maintenance

- Regularnie przeglądaj i aktualizuj teksty bazując na feedbacku użytkowników
- Testuj nowe warianty A/B testingiem
- Usuwaj teksty, które nie konwertują
- Dodawaj sezonowe/eventowe warianty (np. "🎄 Holiday bet on SWIPE!")
