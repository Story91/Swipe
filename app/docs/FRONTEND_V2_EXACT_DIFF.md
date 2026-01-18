# Frontend V2 - Dokładne Zmiany (Diff)

## 📍 Lokalizacja zmian w `app/components/Tasks/DailyTasks.tsx`

---

## ZMIANA 1: Linia 14 - Environment Variable

```diff
- const DAILY_REWARDS_CONTRACT = process.env.NEXT_PUBLIC_DAILY_REWARDS_CONTRACT as `0x${string}` || "0x0000000000000000000000000000000000000000";
+ const DAILY_REWARDS_CONTRACT = process.env.NEXT_PUBLIC_DAILY_REWARDS_V2_CONTRACT as `0x${string}` || "0x0000000000000000000000000000000000000000";
```

---

## ZMIANA 2: Linia 50-65 - ABI getUserStats

```diff
  {
    "inputs": [{"name": "user", "type": "address"}],
    "name": "getUserStats",
    "outputs": [
      {"name": "lastClaimTimestamp", "type": "uint256"},
      {"name": "currentStreak", "type": "uint256"},
      {"name": "longestStreak", "type": "uint256"},
      {"name": "totalClaimed", "type": "uint256"},
      {"name": "jackpotsWon", "type": "uint256"},
      {"name": "canClaimToday", "type": "bool"},
      {"name": "nextClaimTime", "type": "uint256"},
      {"name": "potentialReward", "type": "uint256"}
+     {"name": "isMigrated", "type": "bool"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
```

---

## ZMIANA 3: Linia 113-119 - ABI registerReferral

```diff
  {
-   "inputs": [{"name": "referrer", "type": "address"}],
+   "inputs": [
+     {"name": "referrer", "type": "address"},
+     {"name": "signature", "type": "bytes"}
+   ],
    "name": "registerReferral",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
```

---

## ZMIANA 4: Linia 120-133 - ABI Stałe → Zmienne (OPCJONALNE)

```diff
  {
    "inputs": [],
-   "name": "BASE_DAILY_REWARD",
+   "name": "baseDailyReward",
    "outputs": [{"type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
-   "name": "STREAK_BONUS_PER_DAY",
+   "name": "streakBonusPerDay",
    "outputs": [{"type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
```

**UWAGA:** Ta zmiana jest opcjonalna - tylko jeśli gdzieś w kodzie odczytujesz te wartości. Jeśli nie - możesz zostawić stare nazwy.

---

## ZMIANA 5: Linia 153-162 - Interface UserStats

```diff
interface UserStats {
  lastClaimTimestamp: bigint;
  currentStreak: bigint;
  longestStreak: bigint;
  totalClaimed: bigint;
  jackpotsWon: bigint;
  canClaimToday: boolean;
  nextClaimTime: bigint;
  potentialReward: bigint;
+ isMigrated: boolean;
}
```

---

## ZMIANA 6: Linia 831-838 - Parsowanie userStats (NAJWAŻNIEJSZE!)

```diff
  // Parse user stats
  const stats = userStats ? {
    currentStreak: Number((userStats as any)[1]),
    longestStreak: Number((userStats as any)[2]),
    totalClaimed: (userStats as any)[3] as bigint,
    jackpotsWon: Number((userStats as any)[4]),
    canClaimToday: (userStats as any)[5] as boolean,
    potentialReward: (userStats as any)[7] as bigint,
+   isMigrated: (userStats as any)[8] as boolean,
  } : null;
```

**UWAGA:** To jest kluczowa zmiana! Bez tego TypeScript będzie się skarżyć.

---

## ZMIANA 7: Linia 720-753 - Funkcja handleRegisterReferral

```diff
    try {
-     // First verify both accounts have Farcaster (anti-Sybil check)
-     const verifyResponse = await fetch('/api/daily-tasks/verify-referral', {
+     // Verify referral and get signature from backend
+     const verifyResponse = await fetch('/api/referrals/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
-         userAddress: address,
-         referrerAddress: referralCode,
+         referred: address,
+         referrer: referralCode,
        }),
      });
      
      const verifyResult = await verifyResponse.json();
      
      if (!verifyResult.success) {
        setTaskError(verifyResult.error || 'Referral verification failed');
        setIsVerifyingTask(null);
        return;
      }
      
-     // Verification passed - proceed with on-chain transaction
+     // Verification passed - proceed with on-chain transaction with signature
      if (DAILY_REWARDS_CONTRACT !== "0x0000000000000000000000000000000000000000") {
        writeContract({
          address: DAILY_REWARDS_CONTRACT,
          abi: DAILY_REWARDS_ABI,
          functionName: "registerReferral",
-         args: [referralCode as `0x${string}`],
+         args: [
+           referralCode as `0x${string}`,
+           verifyResult.signature as `0x${string}`  // ⬅️ DODANY podpis
+         ],
        });
        
        setPendingConfirmTask('REFERRAL');
      }
```

---

## ✅ Podsumowanie: Co się zmienia w UI?

### NIE ZMIENIA SIĘ (wszystko działa tak samo):
- ✅ **Daily Claim** - przycisk, animacje, confetti - wszystko identyczne
- ✅ **Task Completion** - Share Cast, Create Prediction, Trading Volume - identyczne
- ✅ **Achievement Claims** - Beta Tester, Follow Socials - identyczne
- ✅ **Wyświetlanie statystyk** - streak, total claimed, jackpots - identyczne
- ✅ **Pool Stats** - wyświetlanie puli - identyczne

### ZMIENIA SIĘ (tylko referale):
- 🔄 **Referale** - teraz wymagają podpisu z backendu (bezpieczniejsze)
  - Użytkownik wprowadza kod referala (tak samo jak wcześniej)
  - Backend weryfikuje i zwraca podpis
  - Kontrakt sprawdza podpis przed przyznaniem nagrody
  - **Dla użytkownika wygląda identycznie** - tylko backend robi więcej pracy

### OPCJONALNIE (możesz dodać):
- ➕ **Banner migracji** - jeśli użytkownik ma dane w V1, pokaż przycisk "Migrate from V1"
  - To jest opcjonalne - bez tego wszystko też działa
  - Użytkownicy mogą migrować sami lub admin może zrobić batch migration

---

## 🎯 Przykład: Jak będzie wyglądać kod po zmianach

### Fragment z parsowaniem (linia 831-838):

**PRZED:**
```typescript
const stats = userStats ? {
  currentStreak: Number((userStats as any)[1]),
  longestStreak: Number((userStats as any)[2]),
  totalClaimed: (userStats as any)[3] as bigint,
  jackpotsWon: Number((userStats as any)[4]),
  canClaimToday: (userStats as any)[5] as boolean,
  potentialReward: (userStats as any)[7] as bigint,
} : null;
```

**PO:**
```typescript
const stats = userStats ? {
  currentStreak: Number((userStats as any)[1]),
  longestStreak: Number((userStats as any)[2]),
  totalClaimed: (userStats as any)[3] as bigint,
  jackpotsWon: Number((userStats as any)[4]),
  canClaimToday: (userStats as any)[5] as boolean,
  potentialReward: (userStats as any)[7] as bigint,
  isMigrated: (userStats as any)[8] as boolean,  // ⬅️ DODANE
} : null;
```

**W JSX (opcjonalnie, jeśli chcesz pokazać banner migracji):**
```typescript
{stats && !stats.isMigrated && stats.currentStreak > 0 && (
  <div className="migration-banner">
    ⚠️ Please migrate from V1
  </div>
)}
```

Ale to jest **opcjonalne** - bez tego wszystko też będzie działać!

---

## 🔍 Jak sprawdzić czy wszystko działa?

### Test 1: Daily Claim
1. Kliknij "Claim Daily"
2. Powinno działać identycznie jak wcześniej
3. Sprawdź czy confetti się pojawia
4. Sprawdź czy streak się zwiększa

### Test 2: Task Completion
1. Wykonaj task (np. Share Cast)
2. Powinno działać identycznie
3. Sprawdź czy nagroda się przyznaje

### Test 3: Referale (NAJWAŻNIEJSZE!)
1. Wprowadź kod referala
2. Kliknij "Register Referral"
3. Backend powinien zwrócić podpis
4. Transakcja powinna przejść
5. Oba konta powinny dostać nagrodę

### Test 4: Wyświetlanie statystyk
1. Sprawdź czy streak się wyświetla
2. Sprawdź czy total claimed się wyświetla
3. Sprawdź czy wszystko wygląda tak samo

---

## ⚠️ Potencjalne problemy i rozwiązania

### Problem 1: TypeScript error "Property 'isMigrated' is missing"
**Rozwiązanie:** Dodaj `isMigrated: (userStats as any)[8] as boolean` do parsowania stats

### Problem 2: Referale nie działają - "Invalid signature"
**Rozwiązanie:**
1. Sprawdź czy endpoint `/api/referrals/verify` istnieje
2. Sprawdź czy zwraca `signature` w odpowiedzi
3. Sprawdź czy przekazujesz podpis do `registerReferral`

### Problem 3: "Function not found" dla BASE_DAILY_REWARD
**Rozwiązanie:**
- Jeśli nie używasz tej wartości - usuń z ABI
- Jeśli używasz - zmień na `baseDailyReward` (camelCase)

### Problem 4: Wszystko działa ale nie widzę zmian
**Rozwiązanie:** To normalne! UI wygląda identycznie, tylko backend i kontrakt są bezpieczniejsze.

---

## ✅ Finalna Checklist

- [ ] Zmień environment variable (linia 14)
- [ ] Zaktualizuj ABI getUserStats (dodaj isMigrated)
- [ ] Zaktualizuj ABI registerReferral (dodaj signature)
- [ ] (Opcjonalnie) Zaktualizuj ABI stałe→zmienne
- [ ] Dodaj isMigrated do interfejsu UserStats
- [ ] Dodaj isMigrated do parsowania stats (linia 831-838)
- [ ] Zaktualizuj funkcję handleRegisterReferral (endpoint + podpis)
- [ ] Przetestuj wszystkie funkcje
- [ ] (Opcjonalnie) Dodaj banner migracji

---

## 🎉 Gotowe!

Po wprowadzeniu tych zmian:
- ✅ Wszystko będzie działać identycznie jak wcześniej
- ✅ Referale będą bezpieczniejsze (z podpisem)
- ✅ Użytkownicy z V1 mogą migrować
- ✅ UI wygląda tak samo (lub lepiej z opcjonalnym bannerem)

**Nic nie popsujemy - tylko dodajemy funkcjonalność i bezpieczeństwo!** 🚀