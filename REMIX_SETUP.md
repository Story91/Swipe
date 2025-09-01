# 🎯 Prediction Market - Remix Setup Guide

## ⚡ Szybki start z Remix IDE

### ❌ Jeśli masz błąd "Stack too deep" - użyj wersji zoptymalizowanej!

### Krok 1: Otwórz Remix
```
https://remix.ethereum.org/
```

### Krok 2: Utwórz nowy plik
1. Kliknij ikonę 📁 **"File Explorers"**
2. Kliknij ➕ **"+"** obok "contracts"
3. Nazwij plik: `PredictionMarket.sol`

### Krok 3: Skopiuj kod kontraktu
**Dla standardowej wersji:**
1. Otwórz plik `contracts/PredictionMarket_Remix.sol`
2. Skopiuj całą zawartość (Ctrl+A, Ctrl+C)
3. Wklej do nowego pliku w Remix (Ctrl+V)

**Dla wersji zoptymalizowanej (Stack-safe):**
1. Otwórz plik `contracts/PredictionMarket_Optimized.sol`
2. Skopiuj całą zawartość
3. Wklej do nowego pliku w Remix

### Krok 4: Skompiluj
1. Przejdź do zakładki 🔧 **"Solidity Compiler"**
2. **Ważne dla wersji zoptymalizowanej:**
   - Włącz **"Enable optimization"**
   - Ustaw **"Runs"** na 200
3. Wybierz kompilator: `0.8.19+commit.7dd6d404`
4. Kliknij 🔄 **"Compile PredictionMarket.sol"**

### Krok 5: Deploy
1. Przejdź do zakładki 🚀 **"Deploy & Run Transactions"**
2. Wybierz środowisko:
   - **JavaScript VM** (dla szybkich testów)
   - **Injected Provider** (dla prawdziwej sieci)
3. Kliknij 📋 **"Deploy"**

---

## 🎮 Jak testować funkcje

### 1. Utwórz predykcję
```javascript
await contract.createPrediction(
    "Will ETH hit $10k in 2024?",
    "Ethereum price prediction",
    "Crypto",
    "https://example.com/eth.png",
    168  // 1 tydzień w godzinach
)
```

### 2. Załóż zakład
```javascript
// Załóż 1 ETH na YES
await contract.placeStake(1, true, {
    value: "1000000000000000000"  // 1 ETH w wei
})
```

### 3. Rozwiąż predykcję (po deadline)
```javascript
// YES wygrywa
await contract.resolvePrediction(1, true)
```

### 4. Odbierz nagrodę
```javascript
await contract.claimReward(1)
```

---

## 📊 Przydatne funkcje do sprawdzenia

### Stan kontraktu
```javascript
// Liczba wszystkich predykcji
await contract.nextPredictionId()

// Szczegóły predykcji
await contract.getPrediction(1)

// Twoje zakłady
await contract.getUserStakeInfo(1, "0xTwojAddress")

// Statystyki rynku
await contract.getMarketStats(1)
```

### Admin funkcje
```javascript
// Dodaj approvera
await contract.setApprover("0xAddressApprovera", true)

// Włącz tworzenie publiczne
await contract.setPublicCreation(true)

// Wypłać opłaty platformy
await contract.withdrawFees()
```

---

## 🐛 Rozwiązywanie problemów

### Błąd kompilacji
- Sprawdź czy używasz kompilatora 0.8.19
- Odśwież stronę Remix (Ctrl+F5)
- Sprawdź czy cały kod został skopiowany

### Błąd deploymentu
- W JavaScript VM: zawsze działa
- W Injected Provider: sprawdź czy masz MetaMask i ETH

### Brak funkcji
- Sprawdź czy kontrakt się skompilował bez błędów
- Odśwież zakładkę Deploy & Run Transactions

---

## 🎯 Następne kroki

Po przetestowaniu w Remix:

1. **Skopiuj address kontraktu**
2. **Zaktualizuj frontend**: `NEXT_PUBLIC_CONTRACT_ADDRESS=0x...`
3. **Deploy na Base mainnet** używając Hardhat
4. **Uruchom aplikację**: `npm run dev`

**Powodzenia! 🚀**
