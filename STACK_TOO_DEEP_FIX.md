# 🔧 Stack Too Deep - Rozwiązania Problemu

## 📋 Co to jest błąd "Stack too deep"?

**Stack too deep** to błąd Solidity, który występuje gdy:
- Funkcja ma zbyt wiele zmiennych lokalnych
- Funkcja zwraca zbyt wiele wartości
- Złożone wyrażenia matematyczne
- Rekurencyjne wywołania funkcji

**Limit stosu EVM**: 16 zmiennych lokalnych na funkcję

## ✅ Rozwiązania

### 1. **Użyj wersji zoptymalizowanej** ⭐ **(Najlepsze rozwiązanie)**

```bash
# Zamiast PredictionMarket_Remix.sol użyj:
contracts/PredictionMarket_Optimized.sol
```

**Zalety:**
- ✅ Bezpieczna dla wszystkich kompilatorów
- ✅ Wszystkie funkcje działają tak samo
- ✅ Zoptymalizowana struktura danych
- ✅ Mniej return values

### 2. **Włącz IR-based compilation** (Dla Hardhat)

**hardhat.config.js:**
```javascript
solidity: {
  version: "0.8.19",
  settings: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
    viaIR: true, // <-- Dodaj tę linię
  },
},
```

**Kompilacja:**
```bash
npm run compile:via-ir
```

### 3. **W Remix włącz optymalizację**

1. Przejdź do **"Solidity Compiler"**
2. Włącz **"Enable optimization"**
3. Ustaw **"Runs"** na 200
4. Skompiluj ponownie

---

## 🔍 Główne problemy w kodzie

### ❌ Problem: Zbyt wiele return values

**Przed (14 wartości):**
```solidity
function getPrediction(uint256 _predictionId) returns (
    string memory question,
    string memory description,
    string memory category,
    string memory imageUrl,
    uint256 yesTotalAmount,
    uint256 noTotalAmount,
    uint256 deadline,
    uint256 resolutionDeadline,
    bool resolved,
    bool outcome,
    bool cancelled,
    uint256 createdAt,
    address creator,
    bool verified,
    bool approved,
    bool needsApproval
)
```

### ✅ Rozwiązanie: Użyj struktur

**Po (1 struktura):**
```solidity
struct PredictionView {
    string question;
    string description;
    string category;
    uint256 yesTotalAmount;
    uint256 noTotalAmount;
    uint256 deadline;
    bool resolved;
    bool outcome;
    bool approved;
    address creator;
}

function getPredictionBasic(uint256 _predictionId) returns (PredictionView memory)
```

### ❌ Problem: Zbyt wiele zmiennych lokalnych

**Przed:**
```solidity
function calculatePayout(uint256 _predictionId, address _user) returns (uint256 payout, uint256 profit) {
    Prediction storage prediction = predictions[_predictionId];
    UserStake storage userStake = userStakes[_predictionId][_user];
    uint256 winnersPool = prediction.outcome ? prediction.yesTotalAmount : prediction.noTotalAmount;
    uint256 losersPool = prediction.outcome ? prediction.noTotalAmount : prediction.yesTotalAmount;
    uint256 userWinningStake = prediction.outcome ? userStake.yesAmount : userStake.noAmount;
    // ... więcej zmiennych
}
```

### ✅ Rozwiązanie: Użyj struktur dla return values

**Po:**
```solidity
struct PayoutInfo {
    uint256 payout;
    uint256 profit;
}

function calculatePayout(uint256 _predictionId, address _user) returns (PayoutInfo memory) {
    // Mniej zmiennych lokalnych
    PayoutInfo memory result;
    // ...
    return result;
}
```

---

## 📁 Pliki rozwiązań

| Plik | Przeznaczenie | Stack Safe |
|------|---------------|------------|
| `contracts/PredictionMarket.sol` | Pełna wersja produkcyjna | ❌ Nie |
| `contracts/PredictionMarket_Remix.sol` | Standard Remix | ⚠️ Częściowo |
| `contracts/PredictionMarket_Optimized.sol` | **Stack-safe Remix** | ✅ Tak |

### 🚀 Rekomendacje:

1. **Dla Remix**: Użyj `PredictionMarket_Optimized.sol`
2. **Dla Hardhat**: Dodaj `viaIR: true` do config
3. **Dla produkcji**: Użyj `PredictionMarket.sol` z OpenZeppelin

---

## 🧪 Jak przetestować

### W Remix:
1. Skopiuj `PredictionMarket_Optimized.sol`
2. Włącz optymalizację (Enable optimization, Runs: 200)
3. Skompiluj i deploy

### W Hardhat:
```bash
# Dodaj do hardhat.config.js:
# viaIR: true

npm run compile
npm run deploy:base-goerli
```

---

## 📊 Porównanie wydajności

| Metoda | Stack Safety | Gas Usage | Complexity |
|--------|--------------|-----------|------------|
| **viaIR** | ✅ Pełna | +10-20% | Wysoka |
| **Optimized** | ✅ Pełna | Bez zmian | Średnia |
| **Original** | ❌ Ryzyko | Najniższa | Niska |

---

## 🎯 Podsumowanie

**Najlepsze rozwiązanie dla Ciebie:**
1. **Użyj `PredictionMarket_Optimized.sol`** w Remix
2. **Włącz optymalizację** w ustawieniach kompilatora
3. **Testuj** wszystkie funkcje dokładnie

**Jeśli nadal masz problemy:**
- Podziel duże funkcje na mniejsze
- Użyj mniej zmiennych lokalnych
- Rozważ użycie storage zamiast memory

Powodzenia! 🚀
