# 🔧 SWIPE Token Approval Slippage Fix

## 📋 Problem

Przy stakowaniu tokenów SWIPE (szczególnie większych kwot >10k-30k), approval był robiony dla **dokładnej kwoty**, bez uwzględnienia slippage. Gdy cena tokena się zmieniała między approval a transakcją stakowania, rzeczywista wymagana kwota mogła przekroczyć zatwierdzoną kwotę, powodując błąd transakcji.

### Przykład problemu:
```
User chce zastakować: 30,000 SWIPE
Approval: 30,000 SWIPE (dokładna kwota)
Cena wzrosła o 3% → Rzeczywista potrzeba: 30,900 SWIPE
❌ Transakcja FAIL - niewystarczający approval
```

---

## ✅ Rozwiązanie: Approval z Buforem Slippage

Dodaliśmy **10% buffer** (1000 basis points) do wszystkich approval tokenów SWIPE. To zapewnia, że approval pokrywa potencjalne wahania cen.

### Implementacja:

```typescript
// Before (❌ Problem)
const approvalAmount = amountWei; // Tylko dokładna kwota

// After (✅ Rozwiązanie)
import { calculateApprovalAmount } from '@/lib/constants/approval';
const approvalAmount = calculateApprovalAmount(amountWei); // +10% buffer
```

### Jak to działa:

```typescript
// Funkcja calculateApprovalAmount
export function calculateApprovalAmount(
  amount: bigint,
  bufferBps: number = 1000 // 10% default
): bigint {
  return (amount * BigInt(10000 + bufferBps)) / BigInt(10000);
}
```

### Przykład z buforem:
```
User chce zastakować: 30,000 SWIPE
Approval: 33,000 SWIPE (30,000 + 10% buffer)
Cena wzrosła o 3% → Rzeczywista potrzeba: 30,900 SWIPE
✅ Transakcja SUCCESS - wystarczający approval
```

---

## 📊 Basis Points (BPS) - Wyjaśnienie

**Basis Points** to jednostka pomiaru równa 0.01% (1/100 procenta).

| BPS | Procent | Przykład (dla 10,000 SWIPE) |
|-----|---------|----------------------------|
| 100 | 1% | Approval: 10,100 SWIPE |
| 500 | 5% | Approval: 10,500 SWIPE |
| 1000 | 10% | Approval: 11,000 SWIPE |
| 2000 | 20% | Approval: 12,000 SWIPE |

**Formuła:**
```
Approval Amount = Base Amount × (10000 + BPS) / 10000
```

---

## 🔧 Zastosowane Zmiany

### 1. Nowy Plik Konfiguracyjny: `lib/constants/approval.ts`

Zawiera:
- ✅ `SLIPPAGE_BUFFER_BPS` - Domyślny buffer 10%
- ✅ `calculateApprovalAmount()` - Funkcja obliczająca approval z buforem
- ✅ `APPROVAL_STRATEGIES` - Różne strategie approval (minimal, conservative, unlimited)
- ✅ `getRecommendedBuffer()` - Rekomendowany buffer na podstawie kwoty

### 2. Zaktualizowane Pliki:

#### `app/components/Main/TinderCard.tsx`
**Linie 1148-1167:** Approval przy stakowaniu SWIPE
```typescript
const approvalAmount = calculateApprovalAmount(amountWei);
```

#### `app/components/Modals/CreatePredictionModal.tsx`
**Linie 301-302:** Approval przy tworzeniu predykcji z SWIPE fee
```typescript
const approvalAmount = calculateApprovalAmount(swipeFeeAmount);
```

---

## 📈 Zalety Rozwiązania

### ✅ Bezpieczeństwo
- Limitowana kwota approval (nie unlimited)
- Użytkownik ma kontrolę nad zatwierdzoną kwotą

### ✅ Elastyczność
- Pokrywa normalne wahania cen (do 10%)
- Działa dla większych kwot (>30k, >50k, >100k SWIPE)

### ✅ User Experience
- Mniej błędów transakcji
- Rzadziej wymagany powtórny approval

### ✅ Zgodność z Best Practices
- Zgodne z dokumentacją Coinbase Developer
- Używane przez Uniswap, SushiSwap, inne DEXy

---

## 🎛️ Dostosowywanie Bufora

### Zmiana Globalnego Bufora

Edytuj `lib/constants/approval.ts`:

```typescript
// Dla bardziej konserwatywnego podejścia (20%)
export const SLIPPAGE_BUFFER_BPS = 2000;

// Dla mniej konserwatywnego podejścia (5%)
export const SLIPPAGE_BUFFER_BPS = 500;
```

### Użycie Custom Bufora dla Konkretnej Transakcji

```typescript
// Większy buffer dla bardzo dużych kwot
const largeStakeApproval = calculateApprovalAmount(amountWei, 2000); // 20%

// Mniejszy buffer dla małych kwot
const smallStakeApproval = calculateApprovalAmount(amountWei, 500); // 5%
```

### Dynamiczny Buffer na Podstawie Kwoty

```typescript
import { getRecommendedBuffer } from '@/lib/constants/approval';

const amount = 100000; // SWIPE amount
const recommendedBps = getRecommendedBuffer(amount);
const approvalAmount = calculateApprovalAmount(amountWei, recommendedBps);
```

---

## 🔮 Alternatywne Strategie (Przyszłość)

### Opcja A: Unlimited Approval

```typescript
import { APPROVAL_STRATEGIES } from '@/lib/constants/approval';

// Jednorazowy approval na maksymalną kwotę
const approvalAmount = APPROVAL_STRATEGIES.UNLIMITED;
// = type(uint256).max = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
```

**Zalety:**
- ✅ Approve tylko raz, potem zero friction
- ✅ Najlepsza UX

**Wady:**
- ⚠️ Większe teoretyczne ryzyko (ale kontrakt jest zaufany)

### Opcja B: Permit2 Integration

Używanie `Permit2` jak w `SwipeTokenCard.tsx`:
- ✅ Gasless approvals (tylko podpisy)
- ✅ Time-limited permissions
- ✅ Najlepsze bezpieczeństwo

**Wymaga:** Integracji Permit2 w `PredictionMarket_V2.sol`

---

## 🧪 Testowanie

### Manual Test Checklist

- [ ] Stakowanie małej kwoty (10k SWIPE) - approval powinien być ~11k
- [ ] Stakowanie dużej kwoty (50k SWIPE) - approval powinien być ~55k
- [ ] Stakowanie bardzo dużej kwoty (100k SWIPE) - approval powinien być ~110k
- [ ] Tworzenie predykcji z SWIPE fee - approval z buforem
- [ ] Sprawdzenie logów konsoli - powinna pokazywać approval details

### Oczekiwane Logi Konsoli

```
💰 SWIPE Approval Details:
  Stake amount: 30000000000000000000000 wei
  Approval amount (with 10% buffer): 33000000000000000000000 wei
  Buffer: 10%
```

---

## 📚 Dokumentacja Źródłowa

Rozwiązanie oparte na:

### Coinbase Developer Documentation
- **Trade API - Slippage Protection:** Standardowy slippage 1-5%, konswerwatywny 10%
- **EVM Swaps API:** Slippage tolerance w basis points (0-10000)
- **Wallet Policies:** Approval best practices

### Inne DEXy
- **Uniswap:** Domyślny slippage 0.5%, max 50%
- **SushiSwap:** Domyślny slippage 0.5-1%
- **0x Protocol:** Używany przez Coinbase Trade API

---

## 🐛 Troubleshooting

### Problem: Nadal otrzymuję błędy insufficient allowance

**Rozwiązanie:** Zwiększ buffer w `lib/constants/approval.ts`

```typescript
export const SLIPPAGE_BUFFER_BPS = 2000; // Zwiększ do 20%
```

### Problem: Nie chcę płacić za taki duży approval

**Rozwiązanie:** Użyj mniejszego bufora dla małych kwot

```typescript
// W TinderCard.tsx, przed calculateApprovalAmount:
const customBps = amount < 10000 ? 500 : 1000; // 5% dla <10k, 10% dla >=10k
const approvalAmount = calculateApprovalAmount(amountWei, customBps);
```

### Problem: Chcę approval tylko raz

**Rozwiązanie:** Rozważ unlimited approval (wymaga zaufania do kontraktu)

```typescript
import { APPROVAL_STRATEGIES } from '@/lib/constants/approval';
const approvalAmount = APPROVAL_STRATEGIES.UNLIMITED;
```

---

## ✅ Status Implementacji

- [x] Utworzono `lib/constants/approval.ts` z funkcjami pomocniczymi
- [x] Zaktualizowano `TinderCard.tsx` - stakowanie SWIPE
- [x] Zaktualizowano `CreatePredictionModal.tsx` - fee SWIPE
- [x] Dodano szczegółowe logi console dla debugowania
- [x] Dokumentacja w `docs/SWIPE_APPROVAL_SLIPPAGE_FIX.md`
- [ ] Testy E2E z różnymi kwotami
- [ ] User feedback po wdrożeniu

---

## 📞 Dalsze Kroki

1. **Testowanie** - Przetestuj z prawdziwymi użytkownikami i różnymi kwotami
2. **Monitoring** - Obserwuj logi błędów approval w produkcji
3. **Optymalizacja** - Dostosuj buffer na podstawie rzeczywistych danych
4. **UI Enhancement** - Pokaż użytkownikowi dokładną kwotę approval w modal
5. **Future:** Rozważ dodanie opcji wyboru między per-transaction i unlimited approval

---

## 💡 Wnioski

Buffer slippage w approval to **standard w DeFi**, używany przez wszystkie główne DEXy. 

10% to **rozsądny balans** między:
- Bezpieczeństwem (nie unlimited)
- Użytecznością (pokrywa wahania cen)
- User Experience (mniej błędów)

---

**Data implementacji:** 2025-01-08  
**Wersja:** 1.0  
**Autor:** AI Assistant (Claude)

