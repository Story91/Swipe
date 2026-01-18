# Frontend V2 - Przykłady kodu

## 1. Zaktualizowany ABI (fragment)

```typescript
// app/components/Tasks/DailyTasks.tsx

const DAILY_REWARDS_ABI = [
  // ... inne funkcje ...
  
  // getUserStats - DODANE isMigrated
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
      {"name": "isMigrated", "type": "bool"}  // ⬅️ NOWE
    ],
    "stateMutability": "view",
    "type": "function"
  },
  
  // registerReferral - DODANY signature
  {
    "inputs": [
      {"name": "referrer", "type": "address"},
      {"name": "signature", "type": "bytes"}  // ⬅️ NOWE
    ],
    "name": "registerReferral",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  
  // Stałe → Zmienne (zmiana nazw)
  {
    "inputs": [],
    "name": "baseDailyReward",  // ⬅️ było BASE_DAILY_REWARD
    "outputs": [{"type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "streakBonusPerDay",  // ⬅️ było STREAK_BONUS_PER_DAY
    "outputs": [{"type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  
  // NOWA funkcja migracji
  {
    "inputs": [],
    "name": "migrateFromV1",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;
```

## 2. Zaktualizowany interfejs UserStats

```typescript
// app/components/Tasks/DailyTasks.tsx

interface UserStats {
  lastClaimTimestamp: bigint;
  currentStreak: bigint;
  longestStreak: bigint;
  totalClaimed: bigint;
  jackpotsWon: bigint;
  canClaimToday: boolean;
  nextClaimTime: bigint;
  potentialReward: bigint;
  isMigrated: boolean;  // ⬅️ NOWE
}
```

## 3. Zaktualizowana funkcja referali

```typescript
// app/components/Tasks/DailyTasks.tsx

// PRZED (V1):
const handleRegisterReferral = async (referralCode: string) => {
  // ... kod weryfikacji ...
  writeContract({
    address: DAILY_REWARDS_CONTRACT,
    abi: DAILY_REWARDS_ABI,
    functionName: "registerReferral",
    args: [referralCode as `0x${string}`],  // ⬅️ Tylko adres
  });
};

// PO (V2):
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
        referred: address,        // ⬅️ NOWE nazwy
        referrer: referralCode,   // ⬅️ NOWE nazwy
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

## 4. Funkcja migracji (opcjonalna)

```typescript
// app/components/Tasks/DailyTasks.tsx

// Dodaj do komponentu
const [isMigrating, setIsMigrating] = useState(false);
const { writeContract: writeContractMigration } = useWriteContract();

const handleMigrateFromV1 = async () => {
  if (!address) return;
  
  setIsMigrating(true);
  setTaskError(null);
  
  try {
    writeContractMigration({
      address: DAILY_REWARDS_CONTRACT,
      abi: DAILY_REWARDS_ABI,
      functionName: "migrateFromV1",
      args: [],
    });
    
    // Po sukcesie, odśwież dane użytkownika
    setTimeout(() => {
      refetchUserStats();
      setIsMigrating(false);
    }, 3000);
  } catch (error) {
    console.error("Migration failed:", error);
    setTaskError(error instanceof Error ? error.message : 'Migration failed');
    setIsMigrating(false);
  }
};

// W JSX - pokaż tylko jeśli użytkownik nie jest zmigrowany
{userStats && !userStats.isMigrated && userStats.lastClaimTimestamp > 0n && (
  <div className="migration-banner">
    <p>⚠️ Migrate your data from V1 to continue earning rewards!</p>
    <button 
      onClick={handleMigrateFromV1}
      disabled={isMigrating}
    >
      {isMigrating ? 'Migrating...' : 'Migrate from V1'}
    </button>
  </div>
)}
```

## 5. Aktualizacja odczytu nagród (stałe → zmienne)

```typescript
// app/components/Tasks/DailyTasks.tsx

// PRZED (V1):
const { data: baseReward } = useReadContract({
  address: DAILY_REWARDS_CONTRACT,
  abi: DAILY_REWARDS_ABI,
  functionName: "BASE_DAILY_REWARD",  // ⬅️ Stała
});

// PO (V2):
const { data: baseReward } = useReadContract({
  address: DAILY_REWARDS_CONTRACT,
  abi: DAILY_REWARDS_ABI,
  functionName: "baseDailyReward",  // ⬅️ Zmienna
});
```

## 6. Obsługa błędów blacklist

```typescript
// app/components/Tasks/DailyTasks.tsx

// W funkcji claimDaily, completeTask, etc.
try {
  // ... wywołanie kontraktu ...
} catch (error: any) {
  if (error?.message?.includes('blacklisted') || error?.shortMessage?.includes('blacklisted')) {
    setTaskError('This address is blacklisted and cannot claim rewards');
    sendNotification({
      title: "❌ Blacklisted",
      body: "This address cannot claim rewards. Contact support if you believe this is an error.",
    });
  } else {
    setTaskError(error?.message || 'Transaction failed');
  }
}
```

## 7. Pełny przykład użycia getUserStats z isMigrated

```typescript
// app/components/Tasks/DailyTasks.tsx

const { data: userStatsData, refetch: refetchUserStats } = useReadContract({
  address: DAILY_REWARDS_CONTRACT,
  abi: DAILY_REWARDS_ABI,
  functionName: "getUserStats",
  args: address ? [address] : undefined,
  query: {
    enabled: !!address && DAILY_REWARDS_CONTRACT !== "0x0000000000000000000000000000000000000000",
  },
});

// Destrukturyzacja z isMigrated
const userStats: UserStats | undefined = userStatsData ? {
  lastClaimTimestamp: userStatsData[0],
  currentStreak: userStatsData[1],
  longestStreak: userStatsData[2],
  totalClaimed: userStatsData[3],
  jackpotsWon: userStatsData[4],
  canClaimToday: userStatsData[5],
  nextClaimTime: userStatsData[6],
  potentialReward: userStatsData[7],
  isMigrated: userStatsData[8],  // ⬅️ NOWE
} : undefined;

// Użycie w UI
{userStats && (
  <div>
    <p>Streak: {userStats.currentStreak.toString()}</p>
    {!userStats.isMigrated && userStats.lastClaimTimestamp > 0n && (
      <p className="warning">⚠️ Please migrate from V1</p>
    )}
  </div>
)}
```

## 8. Aktualizacja zmiennej środowiskowej

```typescript
// app/components/Tasks/DailyTasks.tsx

// PRZED (V1):
const DAILY_REWARDS_CONTRACT = process.env.NEXT_PUBLIC_DAILY_REWARDS_CONTRACT as `0x${string}` || "0x0000000000000000000000000000000000000000";

// PO (V2):
const DAILY_REWARDS_CONTRACT = process.env.NEXT_PUBLIC_DAILY_REWARDS_V2_CONTRACT as `0x${string}` || "0x0000000000000000000000000000000000000000";
```

## 9. Environment variables (.env.local)

```env
# V1 (stary, można zachować dla backward compatibility)
NEXT_PUBLIC_DAILY_REWARDS_CONTRACT=0x... # V1 adres

# V2 (nowy)
NEXT_PUBLIC_DAILY_REWARDS_V2_CONTRACT=0x... # V2 adres

# V1 contract dla migracji (opcjonalne)
NEXT_PUBLIC_DAILY_REWARDS_V1_CONTRACT=0x... # V1 adres (dla referencji)
```

## 10. Kompletny przykład komponentu z migracją

```typescript
// app/components/Tasks/DailyTasks.tsx (fragment)

export function DailyTasks() {
  const { address, isConnected } = useAccount();
  const [isMigrating, setIsMigrating] = useState(false);
  const { writeContract: writeContractMigration } = useWriteContract();
  
  // ... reszta kodu ...
  
  // Funkcja migracji
  const handleMigrateFromV1 = async () => {
    if (!address) return;
    
    setIsMigrating(true);
    setTaskError(null);
    
    try {
      writeContractMigration({
        address: DAILY_REWARDS_CONTRACT,
        abi: DAILY_REWARDS_ABI,
        functionName: "migrateFromV1",
        args: [],
      });
      
      sendNotification({
        title: "🔄 Migrating...",
        body: "Your data is being migrated from V1. This may take a moment.",
      });
      
      // Po sukcesie, odśwież dane
      setTimeout(() => {
        refetchUserStats();
        setIsMigrating(false);
        sendNotification({
          title: "✅ Migration Complete!",
          body: "Your streaks and achievements have been preserved.",
        });
      }, 5000);
    } catch (error) {
      console.error("Migration failed:", error);
      setTaskError(error instanceof Error ? error.message : 'Migration failed');
      setIsMigrating(false);
      sendNotification({
        title: "❌ Migration Failed",
        body: "Please try again or contact support.",
      });
    }
  };
  
  return (
    <div>
      {/* Banner migracji */}
      {userStats && !userStats.isMigrated && userStats.lastClaimTimestamp > 0n && (
        <div style={{
          padding: '12px',
          backgroundColor: '#ffa500',
          borderRadius: '8px',
          marginBottom: '16px',
        }}>
          <p style={{ marginBottom: '8px' }}>
            ⚠️ <strong>Action Required:</strong> Migrate your data from V1 to continue earning rewards!
          </p>
          <button 
            onClick={handleMigrateFromV1}
            disabled={isMigrating}
            style={{
              padding: '8px 16px',
              backgroundColor: '#000',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: isMigrating ? 'not-allowed' : 'pointer',
            }}
          >
            {isMigrating ? 'Migrating...' : 'Migrate from V1'}
          </button>
        </div>
      )}
      
      {/* Reszta komponentu */}
      {/* ... */}
    </div>
  );
}
```

## Podsumowanie zmian

1. ✅ Zmień `NEXT_PUBLIC_DAILY_REWARDS_CONTRACT` → `NEXT_PUBLIC_DAILY_REWARDS_V2_CONTRACT`
2. ✅ Dodaj `isMigrated` do interfejsu `UserStats`
3. ✅ Zaktualizuj ABI - dodaj `signature` do `registerReferral`
4. ✅ Zmień endpoint referali: `/api/daily-tasks/verify-referral` → `/api/referrals/verify`
5. ✅ Dodaj podpis do wywołania `registerReferral`
6. ✅ Zmień nazwy stałych na zmienne (BASE_DAILY_REWARD → baseDailyReward)
7. ✅ (Opcjonalnie) Dodaj funkcję migracji z V1