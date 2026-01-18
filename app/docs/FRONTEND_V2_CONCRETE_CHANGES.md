# Frontend V2 - Konkretne Zmiany w Kodzie

## ✅ Gwarancja: Nic nie popsujemy!

Wszystkie zmiany są **backward compatible** lub **dodatkowe**:
- ✅ Nowe pola są opcjonalne (isMigrated)
- ✅ Stare funkcje działają tak samo (claimDaily, completeTask, etc.)
- ✅ Tylko referale wymagają dodatkowego parametru (podpis)
- ✅ V1 kontrakt nadal działa równolegle

---

## 🔧 ZMIANA 1: Environment Variable

**Plik:** `app/components/Tasks/DailyTasks.tsx` (linia 14)

### PRZED:
```typescript
const DAILY_REWARDS_CONTRACT = process.env.NEXT_PUBLIC_DAILY_REWARDS_CONTRACT as `0x${string}` || "0x0000000000000000000000000000000000000000";
```

### PO:
```typescript
const DAILY_REWARDS_CONTRACT = process.env.NEXT_PUBLIC_DAILY_REWARDS_V2_CONTRACT as `0x${string}` || "0x0000000000000000000000000000000000000000";
```

**Dlaczego bezpieczne:**
- Tylko zmiana nazwy zmiennej środowiskowej
- Kod działa identycznie, tylko łączy się z V2 zamiast V1

---

## 🔧 ZMIANA 2: ABI - getUserStats (dodaj isMigrated)

**Plik:** `app/components/Tasks/DailyTasks.tsx` (linia 50-65)

### PRZED:
```typescript
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
  ],
  "stateMutability": "view",
  "type": "function"
}
```

### PO:
```typescript
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
    {"name": "potentialReward", "type": "uint256"},
    {"name": "isMigrated", "type": "bool"}  // ⬅️ DODANE
  ],
  "stateMutability": "view",
  "type": "function"
}
```

**Dlaczego bezpieczne:**
- Dodajemy tylko nowe pole na końcu
- Wszystkie istniejące pola pozostają w tej samej kolejności
- Destructuring nadal działa (dodamy 9. element)

---

## 🔧 ZMIANA 3: ABI - registerReferral (dodaj signature)

**Plik:** `app/components/Tasks/DailyTasks.tsx` (linia 113-119)

### PRZED:
```typescript
{
  "inputs": [{"name": "referrer", "type": "address"}],
  "name": "registerReferral",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
}
```

### PO:
```typescript
{
  "inputs": [
    {"name": "referrer", "type": "address"},
    {"name": "signature", "type": "bytes"}  // ⬅️ DODANE
  ],
  "name": "registerReferral",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
}
```

**Dlaczego bezpieczne:**
- Tylko referale używają tej funkcji
- Dodajemy parametr, który otrzymamy z API
- Reszta funkcji (claimDaily, completeTask, claimAchievement) nie zmienia się

---

## 🔧 ZMIANA 4: ABI - Stałe → Zmienne (opcjonalne)

**Plik:** `app/components/Tasks/DailyTasks.tsx` (linia 120-133)

### PRZED:
```typescript
{
  "inputs": [],
  "name": "BASE_DAILY_REWARD",
  "outputs": [{"type": "uint256"}],
  "stateMutability": "view",
  "type": "function"
},
{
  "inputs": [],
  "name": "STREAK_BONUS_PER_DAY",
  "outputs": [{"type": "uint256"}],
  "stateMutability": "view",
  "type": "function"
}
```

### PO:
```typescript
{
  "inputs": [],
  "name": "baseDailyReward",  // ⬅️ Zmienione na camelCase
  "outputs": [{"type": "uint256"}],
  "stateMutability": "view",
  "type": "function"
},
{
  "inputs": [],
  "name": "streakBonusPerDay",  // ⬅️ Zmienione na camelCase
  "outputs": [{"type": "uint256"}],
  "stateMutability": "view",
  "type": "function"
}
```

**UWAGA:** Ta zmiana jest opcjonalna - tylko jeśli gdzieś w kodzie odczytujesz te wartości. Jeśli nie - możesz zostawić stare (nie zaszkodzi).

---

## 🔧 ZMIANA 5: Interface UserStats (dodaj isMigrated)

**Plik:** `app/components/Tasks/DailyTasks.tsx` (linia 153-162)

### PRZED:
```typescript
interface UserStats {
  lastClaimTimestamp: bigint;
  currentStreak: bigint;
  longestStreak: bigint;
  totalClaimed: bigint;
  jackpotsWon: bigint;
  canClaimToday: boolean;
  nextClaimTime: bigint;
  potentialReward: bigint;
}
```

### PO:
```typescript
interface UserStats {
  lastClaimTimestamp: bigint;
  currentStreak: bigint;
  longestStreak: bigint;
  totalClaimed: bigint;
  jackpotsWon: bigint;
  canClaimToday: boolean;
  nextClaimTime: bigint;
  potentialReward: bigint;
  isMigrated: boolean;  // ⬅️ DODANE
}
```

**Dlaczego bezpieczne:**
- Tylko dodajemy nowe pole
- Wszystkie istniejące pola pozostają bez zmian
- TypeScript będzie wymagał aktualizacji destructuring (pokazane poniżej)

---

## 🔧 ZMIANA 6: Destructuring userStats (NAJWAŻNIEJSZE!)

**Plik:** `app/components/Tasks/DailyTasks.tsx` (linia 831-838)

Musisz znaleźć miejsce gdzie parsujesz `userStats` z kontraktu. Prawdopodobnie wygląda tak:

### PRZED:
```typescript
// Parse user stats
const stats = userStats ? {
  currentStreak: Number((userStats as any)[1]),
  longestStreak: Number((userStats as any)[2]),
  totalClaimed: (userStats as any)[3] as bigint,
  jackpotsWon: Number((userStats as any)[4]),
  canClaimToday: (userStats as any)[5] as boolean,
  potentialReward: (userStats as any)[7] as bigint,
} : null;
```

### PO:
```typescript
// Parse user stats
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

**UWAGA:** To jest kluczowa zmiana! Bez tego TypeScript będzie się skarżyć.

---

## 🔧 ZMIANA 7: Funkcja handleRegisterReferral

**Plik:** `app/components/Tasks/DailyTasks.tsx` (linia 690-753)

### PRZED:
```typescript
const handleRegisterReferral = async (referralCode: string) => {
  // ... walidacja ...
  
  setIsVerifyingTask('REFERRAL');
  setTaskError(null);
  
  try {
    // ⬅️ STARY endpoint
    const verifyResponse = await fetch('/api/daily-tasks/verify-referral', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userAddress: address,
        referrerAddress: referralCode,
      }),
    });
    
    const verifyResult = await verifyResponse.json();
    
    if (!verifyResult.success) {
      setTaskError(verifyResult.error || 'Referral verification failed');
      setIsVerifyingTask(null);
      return;
    }
    
    // ⬅️ TYLKO referrer (bez podpisu)
    if (DAILY_REWARDS_CONTRACT !== "0x0000000000000000000000000000000000000000") {
      writeContract({
        address: DAILY_REWARDS_CONTRACT,
        abi: DAILY_REWARDS_ABI,
        functionName: "registerReferral",
        args: [referralCode as `0x${string}`],
      });
      
      setPendingConfirmTask('REFERRAL');
    }
  } catch (error) {
    console.error("Referral failed:", error);
    setTaskError(error instanceof Error ? error.message : 'Referral failed');
    setIsVerifyingTask(null);
  }
};
```

### PO:
```typescript
const handleRegisterReferral = async (referralCode: string) => {
  if (!address) return;
  
  setIsVerifyingTask('REFERRAL');
  setTaskError(null);
  
  try {
    // ⬅️ NOWY endpoint
    const verifyResponse = await fetch('/api/referrals/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        referred: address,        // ⬅️ Zmienione nazwy
        referrer: referralCode,   // ⬅️ Zmienione nazwy
      }),
    });
    
    const verifyResult = await verifyResponse.json();
    
    if (!verifyResult.success) {
      setTaskError(verifyResult.error || 'Referral verification failed');
      setIsVerifyingTask(null);
      return;
    }
    
    // ⬅️ referrer + signature (2 argumenty)
    if (DAILY_REWARDS_CONTRACT !== "0x0000000000000000000000000000000000000000") {
      writeContract({
        address: DAILY_REWARDS_CONTRACT,
        abi: DAILY_REWARDS_ABI,
        functionName: "registerReferral",
        args: [
          referralCode as `0x${string}`,
          verifyResult.signature as `0x${string}`  // ⬅️ DODANY podpis
        ],
      });
      
      setPendingConfirmTask('REFERRAL');
    }
  } catch (error) {
    console.error("Referral failed:", error);
    setTaskError(error instanceof Error ? error.message : 'Referral failed');
    setIsVerifyingTask(null);
  }
};
```

**Dlaczego bezpieczne:**
- Tylko referale używają tej funkcji
- Reszta funkcji (claimDaily, completeTask, claimAchievement) nie zmienia się
- Jeśli referale nie działają - reszta działa normalnie

---

## 📊 Podsumowanie: Co się zmienia w UI?

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

### Fragment z destructuring (linia 831-838):

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

## 💡 Bonus: Opcjonalny banner migracji

Jeśli chcesz pomóc użytkownikom z V1, możesz dodać:

```typescript
// W JSX, gdzie wyświetlasz statystyki użytkownika
{stats && !stats.isMigrated && stats.currentStreak > 0 && (
  <div style={{
    padding: '12px',
    backgroundColor: '#ffa500',
    borderRadius: '8px',
    marginBottom: '16px',
    textAlign: 'center'
  }}>
    <p style={{ margin: 0, fontWeight: 'bold' }}>
      ⚠️ Action Required: Migrate from V1
    </p>
    <p style={{ margin: '8px 0 0 0', fontSize: '14px' }}>
      Your streaks and achievements will be preserved
    </p>
    <button
      onClick={handleMigrateFromV1}
      style={{
        marginTop: '8px',
        padding: '8px 16px',
        backgroundColor: '#000',
        color: '#fff',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer'
      }}
    >
      Migrate Now
    </button>
  </div>
)}
```

Ale to jest **opcjonalne** - bez tego wszystko też będzie działać!