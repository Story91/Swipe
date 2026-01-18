# Frontend V2 Migration Guide

## Przegląd zmian

Frontend wymaga aktualizacji do obsługi V2 kontraktu SwipeDailyRewards. Główne zmiany:

1. **Nowy adres kontraktu** - użyj V2 zamiast V1
2. **Zmienione ABI** - nowe funkcje i zmienne zamiast stałych
3. **Referrale wymagają podpisu** - nowy endpoint API
4. **Dodatkowe pole w getUserStats** - `isMigrated`
5. **Zmienne zamiast stałych** - nagrody są teraz zmiennymi

## Wymagane zmiany

### 1. Zmiana adresu kontraktu

**Plik:** `app/components/Tasks/DailyTasks.tsx`

**Zmiana:**
```typescript
// PRZED (V1)
const DAILY_REWARDS_CONTRACT = process.env.NEXT_PUBLIC_DAILY_REWARDS_CONTRACT as `0x${string}` || "0x0000000000000000000000000000000000000000";

// PO (V2)
const DAILY_REWARDS_CONTRACT = process.env.NEXT_PUBLIC_DAILY_REWARDS_V2_CONTRACT as `0x${string}` || "0x0000000000000000000000000000000000000000";
```

**Environment variable:**
```env
# .env.local
NEXT_PUBLIC_DAILY_REWARDS_V2_CONTRACT=0x... # Adres V2 kontraktu
```

### 2. Aktualizacja ABI

**Plik:** `app/components/Tasks/DailyTasks.tsx` (linia ~42)

**Zmiany w ABI:**

#### a) `getUserStats` - dodane pole `isMigrated`
```typescript
// PRZED (V1)
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

// PO (V2) - dodane isMigrated
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
    {"name": "isMigrated", "type": "bool"}  // NOWE
  ],
  "stateMutability": "view",
  "type": "function"
}
```

#### b) `registerReferral` - wymaga podpisu
```typescript
// PRZED (V1)
{
  "inputs": [{"name": "referrer", "type": "address"}],
  "name": "registerReferral",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
}

// PO (V2) - dodany parametr signature
{
  "inputs": [
    {"name": "referrer", "type": "address"},
    {"name": "signature", "type": "bytes"}
  ],
  "name": "registerReferral",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
}
```

#### c) Stałe → Zmienne (usunąć z ABI, używać bezpośrednio)
```typescript
// PRZED (V1) - stałe w ABI
{
  "inputs": [],
  "name": "BASE_DAILY_REWARD",
  "outputs": [{"type": "uint256"}],
  "stateMutability": "view",
  "type": "function"
}

// PO (V2) - zmienne (nazwy małymi literami)
{
  "inputs": [],
  "name": "baseDailyReward",
  "outputs": [{"type": "uint256"}],
  "stateMutability": "view",
  "type": "function"
}
```

**Pełny zaktualizowany ABI:**
```typescript
const DAILY_REWARDS_ABI = [
  {
    "inputs": [],
    "name": "claimDaily",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
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
      {"name": "isMigrated", "type": "bool"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "user", "type": "address"}],
    "name": "getUserDailyTasks",
    "outputs": [
      {"name": "shareCast", "type": "bool"},
      {"name": "createPrediction", "type": "bool"},
      {"name": "tradingVolume", "type": "bool"},
      {"name": "needsReset", "type": "bool"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "user", "type": "address"}],
    "name": "getUserAchievements",
    "outputs": [
      {"name": "isBetaTester", "type": "bool"},
      {"name": "hasFollowedSocials", "type": "bool"},
      {"name": "hasStreak7", "type": "bool"},
      {"name": "hasStreak30", "type": "bool"},
      {"name": "referrals", "type": "uint256"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getPoolStats",
    "outputs": [
      {"name": "poolBalance", "type": "uint256"},
      {"name": "distributed", "type": "uint256"},
      {"name": "userCount", "type": "uint256"},
      {"name": "claimCount", "type": "uint256"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "taskType", "type": "string"},
      {"name": "signature", "type": "bytes"}
    ],
    "name": "completeTask",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "referrer", "type": "address"},
      {"name": "signature", "type": "bytes"}
    ],
    "name": "registerReferral",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "baseDailyReward",
    "outputs": [{"type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "streakBonusPerDay",
    "outputs": [{"type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "achievementType", "type": "string"},
      {"name": "signature", "type": "bytes"}
    ],
    "name": "claimAchievement",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "user", "type": "address"}],
    "name": "hasUsedReferral",
    "outputs": [{"type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "migrateFromV1",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;
```

### 3. Aktualizacja interfejsu UserStats

**Plik:** `app/components/Tasks/DailyTasks.tsx` (linia ~153)

```typescript
// PRZED (V1)
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

// PO (V2) - dodane isMigrated
interface UserStats {
  lastClaimTimestamp: bigint;
  currentStreak: bigint;
  longestStreak: bigint;
  totalClaimed: bigint;
  jackpotsWon: bigint;
  canClaimToday: boolean;
  nextClaimTime: bigint;
  potentialReward: bigint;
  isMigrated: boolean;  // NOWE
}
```

### 4. Aktualizacja funkcji referali

**Plik:** `app/components/Tasks/DailyTasks.tsx` (linia ~720)

**PRZED (V1):**
```typescript
const handleRegisterReferral = async (referralCode: string) => {
  // ...
  const verifyResponse = await fetch('/api/daily-tasks/verify-referral', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userAddress: address,
      referrerAddress: referralCode,
    }),
  });
  
  // ...
  writeContract({
    address: DAILY_REWARDS_CONTRACT,
    abi: DAILY_REWARDS_ABI,
    functionName: "registerReferral",
    args: [referralCode as `0x${string}`],
  });
};
```

**PO (V2):**
```typescript
const handleRegisterReferral = async (referralCode: string) => {
  if (!address) return;
  
  setIsVerifyingTask('REFERRAL');
  setTaskError(null);
  
  try {
    // NOWY endpoint
    const verifyResponse = await fetch('/api/referrals/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        referred: address,        // Zmienione nazwy
        referrer: referralCode,   // Zmienione nazwy
      }),
    });
    
    const verifyResult = await verifyResponse.json();
    
    if (!verifyResult.success) {
      setTaskError(verifyResult.error || 'Referral verification failed');
      setIsVerifyingTask(null);
      return;
    }
    
    // DODANY podpis jako drugi argument
    if (DAILY_REWARDS_CONTRACT !== "0x0000000000000000000000000000000000000000") {
      writeContract({
        address: DAILY_REWARDS_CONTRACT,
        abi: DAILY_REWARDS_ABI,
        functionName: "registerReferral",
        args: [
          referralCode as `0x${string}`,
          verifyResult.signature as `0x${string}`  // NOWE
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

### 5. Aktualizacja odczytu stałych → zmiennych

Jeśli gdzieś w kodzie odczytujesz `BASE_DAILY_REWARD`, zmień na `baseDailyReward`:

```typescript
// PRZED (V1)
const { data: baseReward } = useReadContract({
  address: DAILY_REWARDS_CONTRACT,
  abi: DAILY_REWARDS_ABI,
  functionName: "BASE_DAILY_REWARD",
});

// PO (V2)
const { data: baseReward } = useReadContract({
  address: DAILY_REWARDS_CONTRACT,
  abi: DAILY_REWARDS_ABI,
  functionName: "baseDailyReward",
});
```

## Checklist migracji

- [ ] Zaktualizuj `NEXT_PUBLIC_DAILY_REWARDS_V2_CONTRACT` w `.env.local`
- [ ] Zaktualizuj ABI w `DailyTasks.tsx`
- [ ] Dodaj `isMigrated` do interfejsu `UserStats`
- [ ] Zaktualizuj funkcję `handleRegisterReferral` aby używała `/api/referrals/verify`
- [ ] Zaktualizuj wywołanie `registerReferral` aby zawierało podpis
- [ ] Zmień odczyty stałych na zmienne (BASE_DAILY_REWARD → baseDailyReward, etc.)
- [ ] (Opcjonalnie) Dodaj przycisk migracji z V1
- [ ] Przetestuj wszystkie funkcje:
  - [ ] Daily claim
  - [ ] Task completion
  - [ ] Achievement claims
  - [ ] Referral registration
  - [ ] User stats display