# SharePredictionButton - MiniKit Integration

Komponent do udostępniania predykcji na Farcaster używając hooków MiniKit.

## Funkcjonalności

### 1. Automatyczne udostępnianie po stawce
- Po udanej stawce pojawia się prompt z opcjami udostępniania
- Trzy typy udostępniania: osiągnięcie, wyzwanie, prognoza
- Automatycznie generuje embed z linkiem do aplikacji

### 2. Różne typy udostępniania

#### Osiągnięcie (Achievement)
```typescript
🎉 Właśnie postawiłem na: [pytanie predykcji]

💰 Stawka: [kwota] ETH

Czy masz odwagę przewidzieć przyszłość? 🔮
```

#### Wyzwanie (Challenge)
```typescript
🏆 Wyzwanie: Czy potrafisz przewidzieć: [pytanie predykcji]?

💰 Stawka: [kwota] ETH

Spróbuj pobić moją prognozę! 🎯
```

#### Prognoza (Prediction)
```typescript
🔮 Prognozuję: [pytanie predykcji]
💰 Stawka: [kwota] ETH

Dołącz do gry i stwórz własną prognozę! 🎯
```

## Użycie

### Podstawowe użycie
```typescript
import SharePredictionButton from '../Actions/SharePredictionButton';

<SharePredictionButton 
  prediction={{
    id: "123",
    question: "Czy Bitcoin osiągnie $100k w 2024?",
    category: "crypto",
    stake: 0.1,
    outcome: "YES"
  }}
  onShare={() => console.log('Udostępniono!')}
/>
```

### Z hookiem
```typescript
import { useSharePrediction } from '../Actions/SharePredictionButton';

function MyComponent() {
  const { sharePrediction } = useSharePrediction();
  
  const handleShare = async () => {
    await sharePrediction(predictionData, 'achievement');
  };
  
  return <button onClick={handleShare}>Udostępnij</button>;
}
```

## Integracja z TinderCard

Funkcjonalność jest już zintegrowana z TinderCard:

1. Po udanej stawce automatycznie pojawia się prompt udostępniania
2. Użytkownik może wybrać typ udostępniania
3. Link prowadzi do pięknego embed z informacjami o predykcji

## Embed Page

Każda predykcja ma dedykowaną stronę embed pod `/prediction/[id]` która:
- Pokazuje piękny preview predykcji
- Wyświetla aktualne stawki YES/NO
- Ma meta tagi dla social media
- Jest zoptymalizowana pod kątem udostępniania

## Konfiguracja

Upewnij się, że masz skonfigurowany MiniKit w `providers.tsx`:

```typescript
import { MiniKitProvider } from '@coinbase/onchainkit/minikit'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MiniKitProvider>
      <OnchainKitProvider>
        {children}
      </OnchainKitProvider>
    </MiniKitProvider>
  )
}
```

## Best Practices

1. **Timing**: Udostępnianie pojawia się 2 sekundy po udanej stawce
2. **Content**: Teksty są po polsku i zawierają emoji dla lepszego engagement
3. **Embeds**: Każdy link zawiera embed z aktualnymi danymi predykcji
4. **UX**: Użytkownik może pominąć udostępnianie klikając "Nie teraz"

## Przykład działania

1. Użytkownik stawia na predykcję
2. Transakcja się udaje
3. Po 2 sekundach pojawia się prompt udostępniania
4. Użytkownik wybiera typ udostępniania
5. Otwiera się native composer Farcaster z prefilled contentem
6. Link prowadzi do pięknego embed z predykcją
