# SwipeDailyRewards V2 - Migration Guide

## Główne zmiany w V2

### 1. **Blacklist Support**
- Dodano mapping `blacklist` do blokowania adresów
- Funkcje `setBlacklist()` i `batchSetBlacklist()` dla zarządzania
- Modifier `notBlacklisted` blokuje wszystkie operacje dla zablokowanych adresów

### 2. **Edytowalne nagrody**
- Wszystkie nagrody są teraz zmiennymi zamiast stałych
- Funkcje `set*Reward()` pozwalają na zmianę wartości nagród
- Każda funkcja ma limity min/max aby zapobiec nadużyciom
- Domyślne wartości są takie same jak w V1

### 3. **Podpis przy referalach**
- Funkcja `registerReferral()` wymaga teraz podpisu z backendu
- Zapobiega farmieniu referali przez tworzenie wielu kont
- Backend weryfikuje czy referral jest prawidłowy przed podpisaniem

### 4. **Zmniejszone nagrody za referale**
- Domyślna nagroda: **50,000 SWIPE** (było 150,000)
- Można edytować przez `setReferralReward()` (limit: 10k-100k)

### 5. **Migracja danych z V1**
- Funkcja `migrateFromV1()` - użytkownicy mogą migrować sami
- Funkcja `batchMigrateFromV1()` - admin może migrować wielu użytkowników
- Migruje:
  - Streaks (currentStreak, longestStreak)
  - Achievements (beta tester, follow socials, streak 7/30)
  - Referral data (referredBy, referralCount, hasUsedReferral)
  - Statystyki (totalClaimed, jackpotsWon, lastClaimTimestamp)

## Struktura migracji

### Dane migrowane z V1:
```solidity
- lastClaimTimestamp
- currentStreak
- longestStreak
- totalClaimed
- lastTaskResetDay
- jackpotsWon
- isBetaTester
- hasFollowedSocials
- hasStreak7Achievement
- hasStreak30Achievement
- referredBy
- referralCount
- hasUsedReferral
```

### Flaga migracji:
- Każdy użytkownik ma flagę `migrated` aby zapobiec podwójnej migracji
- Użytkownicy z blacklist nie mogą migrować

## Proces wdrożenia

### 1. Deploy V2 kontraktu
```javascript
const SwipeDailyRewards_V2 = await ethers.getContractFactory("SwipeDailyRewards_V2");
const v2 = await SwipeDailyRewards_V2.deploy(
    swipeTokenAddress,
    taskVerifierAddress,
    v1ContractAddress  // Adres starego kontraktu
);
```

### 2. Migracja danych
**Opcja A: Użytkownicy migrują sami**
- Użytkownicy wywołują `migrateFromV1()` gdy są gotowi
- Proces jest bezpłatny (tylko gas)

**Opcja B: Batch migration przez admina**
- Admin wywołuje `batchMigrateFromV1([addresses])`
- Można migrować wielu użytkowników naraz
- Zalecane dla aktywnych użytkowników

### 3. Konfiguracja nagród (opcjonalne)
```solidity
// Przykładowe zmiany nagród
v2.setReferralReward(50_000 * 10**18);  // Zmniejszona z 150k
v2.setBaseDailyReward(60_000 * 10**18); // Zwiększona z 50k
```

### 4. Konfiguracja blacklist
```solidity
// Dodaj adresy do blacklist
v2.setBlacklist(blacklistedAddress, true);

// Lub batch
v2.batchSetBlacklist([addr1, addr2], [true, true]);
```

### 5. Aktualizacja backendu
- Backend musi obsługiwać podpisy dla referali
- Funkcja weryfikacji referali powinna sprawdzać:
  - Czy referrer jest aktywnym użytkownikiem
  - Czy referral nie był już użyty
  - Czy oba adresy nie są na blacklist

## Backend - Weryfikacja referali

### Przykładowa implementacja podpisu:
```typescript
import { ethers } from 'ethers';

async function signReferral(referred: string, referrer: string): Promise<string> {
  const currentDay = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  const messageHash = ethers.keccak256(
    ethers.solidityPacked(
      ['address', 'address', 'string', 'uint256'],
      [referred, referrer, 'REFERRAL', currentDay]
    )
  );

  const ethSignedHash = ethers.keccak256(
    ethers.solidityPacked(['string', 'bytes32'], ['\x19Ethereum Signed Message:\n32', messageHash])
  );

  const signer = new ethers.Wallet(process.env.TASK_VERIFIER_PRIVATE_KEY);
  return await signer.signMessage(ethers.getBytes(ethSignedHash));
}
```

## Limity nagród (zabezpieczenia)

| Nagroda | Min | Max | Domyślna |
|---------|-----|-----|----------|
| Base Daily | 10k | 200k | 50k |
| Streak Bonus/Day | 1k | 50k | 10k |
| Max Streak Days | 5 | 30 | 10 |
| Jackpot | 50k | 1M | 250k |
| Jackpot Chance | 1% | 20% | 5% |
| Share Cast | 10k | 200k | 50k |
| Create Prediction | 10k | 200k | 75k |
| Trading Volume | 10k | 200k | 100k |
| **Referral** | **10k** | **100k** | **50k** |
| Beta Tester | 100k | 2M | 500k |
| Follow Socials | 10k | 500k | 100k |
| Streak 7 | 50k | 1M | 250k |
| Streak 30 | 100k | 5M | 1M |

## Bezpieczeństwo

### Blacklist
- Blokuje wszystkie operacje (claim, tasks, achievements, referrals)
- Można dodać przed lub po migracji
- Batch operations dla efektywności

### Podpisy
- Referrale wymagają podpisu z backendu
- Zapobiega farmieniu przez tworzenie wielu kont
- Podpis zawiera dzień aby zapobiec replay attacks

### Migracja
- Flaga `migrated` zapobiega podwójnej migracji
- Blacklisted addresses nie mogą migrować
- Dane są tylko do odczytu z V1 (nie można ich zmienić)

## Testowanie

### Test migracji:
```javascript
// 1. Sprawdź dane w V1
const v1Data = await v1.users(userAddress);

// 2. Migruj
await v2.migrateFromV1({ from: userAddress });

// 3. Sprawdź dane w V2
const v2Data = await v2.users(userAddress);
assert.equal(v2Data.currentStreak, v1Data.currentStreak);
assert.equal(v2Data.migrated, true);
```

### Test blacklist:
```javascript
await v2.setBlacklist(userAddress, true);
await expect(v2.claimDaily({ from: userAddress }))
  .to.be.revertedWith("Address is blacklisted");
```

### Test referali z podpisem:
```javascript
const signature = await signReferral(referred, referrer);
await v2.registerReferral(referrer, signature, { from: referred });
```

## Zalecenia

1. **Stopniowa migracja**: Pozwól użytkownikom migrować samodzielnie przez pierwsze tygodnie
2. **Batch migration**: Migruj aktywnych użytkowników batch'em
3. **Monitoring**: Monitoruj migracje i blacklist
4. **Backend update**: Zaktualizuj backend aby obsługiwał podpisy referali
5. **Komunikacja**: Poinformuj użytkowników o możliwości migracji

## FAQ

**Q: Czy użytkownicy muszą migrować?**
A: Tak, aby korzystać z V2 muszą wywołać `migrateFromV1()`. V1 pozostaje aktywny.

**Q: Co się stanie ze streakami jeśli nie zmigrują?**
A: Streaki w V1 pozostają, ale nie będą kontynuowane w V2. Po migracji streak jest zachowany.

**Q: Czy można cofnąć blacklist?**
A: Tak, `setBlacklist(address, false)` usuwa z blacklist.

**Q: Jak często można zmieniać nagrody?**
A: W każdej chwili przez owner, ale zmiany są publiczne i transparentne.