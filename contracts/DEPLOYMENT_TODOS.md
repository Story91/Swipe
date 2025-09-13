# 🚀 DEPLOYMENT TODOS - PredictionMarket V2

## 📊 PORÓWNANIE KONTRAKTÓW

### **PredictionMarket_Optimized.sol (V1) vs PredictionMarket_V2.sol**

#### **NOWE FUNKCJONALNOŚCI W V2:**

1. **Multi-Token Support ($SWIPE)**
   - ✅ Oddzielne pule staking (ETH + $SWIPE)
   - ✅ `placeStakeWithToken()` - staking $SWIPE
   - ✅ `claimRewardWithToken()` - claiming $SWIPE
   - ✅ Oddzielne limity dla każdego tokenu

2. **Flexible Creation Fees**
   - ✅ Dynamiczne fees per token (ETH: 0.0001, $SWIPE: 200,000)
   - ✅ `createPredictionWithToken()` - tworzenie za $SWIPE
   - ✅ Auto-refund przy reject

3. **Enhanced Approval System**
   - ✅ Owner jest zawsze approverem
   - ✅ `requiredApprovals` może być 0 (public creation)
   - ✅ Bardziej elastyczne zarządzanie

4. **Separate Fee Management**
   - ✅ `ethFees` i `swipeFees` - oddzielne pule
   - ✅ `withdrawEthFees()` i `withdrawSwipeFees()`
   - ✅ Platform fee z obu pul (1%)

5. **Better Limits**
   - ✅ ETH: 0.00001 - 100 ETH
   - ✅ $SWIPE: 10,000 - unlimited
   - ✅ Osobne funkcje setEthStakeLimits/setSwipeStakeLimits

## 📝 DEPLOYMENT CHECKLIST

### **1. SMART CONTRACT DEPLOYMENT**
- [ ] **Deploy PredictionMarket_V2.sol na Base**
  - [ ] Przygotować adres $SWIPE token: `0xd0187D77Af0ED6a44F0A631B406c78b30E160aA9`
  - [ ] Deploy z constructorem: `constructor(0xd0187D77Af0ED6a44F0A631B406c78b30E160aA9)`
  - [ ] Użyć scripts/deploy_V2.js
  - [ ] Verify kontrakt na BaseScan

### **2. CONTRACT CONFIGURATION**
- [ ] **Ustawić supported tokens**
  ```solidity
  setSupportedToken(0xd0187D77Af0ED6a44F0A631B406c78b30E160aA9, true) // $SWIPE
  ```
- [ ] **Ustawić creation fees**
  ```solidity
  setCreationFee(ETH_ADDRESS, 0.0001 ether)
  setCreationFee(swipeAddress, 200000 * 10**18)
  ```
- [ ] **Dodać approverów (jeśli potrzeba)**
- [ ] **Ustawić platform fee (jeśli inne niż 1%)**

### **3. UPDATE CONTRACT FILES**
- [x] **lib/contract.ts - SWIPE config dodany**
  ```typescript
  // ✅ SWIPE token config już dodany:
  export const SWIPE_TOKEN = {
    address: '0xd0187D77Af0ED6a44F0A631B406c78b30E160aA9',
    symbol: 'SWIPE',
    decimals: 18,
    name: 'Swipe'
  };
  ```
- [ ] **Po deploy - zaktualizować:**
  ```typescript
  // Nowy adres kontraktu V2
  export const CONTRACT_ADDRESS = 'NOWY_ADRES_V2_Z_DEPLOY';
  
  // Nowe ABI z V2 (wygenerować po compile)
  export const CONTRACT_ABI = [...]; // ABI z artifacts/contracts/PredictionMarket_V2.sol/PredictionMarketV2.json
  ```

### **4. FRONTEND UPDATES - COMPONENTS**

#### **A. TinderCard.tsx**
- [ ] Import SWIPE_TOKEN z lib/contract.ts
- [ ] Dodać wybór tokenu przy staking (ETH/$SWIPE)
- [ ] Implementować approve flow dla $SWIPE przed staking
- [ ] Wyświetlać dwie pule (ETH pool + $SWIPE pool)
- [ ] Osobne przyciski claim dla każdego tokenu
- [ ] Pokazywać limity dla wybranego tokenu (ETH: 0.00001-100, SWIPE: 10,000-unlimited)

#### **B. CreatePredictionModal.tsx**
- [ ] Import SWIPE_TOKEN z lib/contract.ts
- [ ] Dodać wybór tokenu do płatności (ETH/$SWIPE)
- [ ] Wyświetlać odpowiednie creation fee (ETH: 0.0001, SWIPE: 200,000)
- [ ] Implementować approve flow dla $SWIPE przed creation
- [ ] Obsługa `createPredictionWithToken()` dla $SWIPE

#### **C. ActiveBets.tsx / BetHistory.tsx**
- [ ] Pokazywać w jakim tokenie był stake
- [ ] Osobne claiming dla ETH i $SWIPE
- [ ] Wyświetlać status obu tokenów

#### **D. AdminPanel.tsx**
- [ ] Dodać zarządzanie $SWIPE settings
- [ ] Osobne withdraw dla ETH i $SWIPE fees
- [ ] Monitoring obu pul

### **5. API ENDPOINTS UPDATES**

#### **app/api/predictions/route.ts**
- [ ] Obsługa multi-token stakes w Redis
- [ ] Zapisywanie typu tokenu w cache

#### **app/api/stakes/route.ts**
- [ ] Rozróżnianie ETH vs $SWIPE stakes
- [ ] Walidacja limitów per token

#### **app/api/portfolio/route.ts**
- [ ] Zwracanie info o obu tokenach
- [ ] Kalkulacja rewards dla $SWIPE

### **6. REDIS/CACHE UPDATES**
- [ ] **lib/types/redis.ts**
  - Dodać pola dla $SWIPE amounts
  - Token type w stakes
- [ ] **lib/redis-utils.ts**
  - Update sync logic dla dual pools

### **7. TESTING CHECKLIST**

#### **User Flow Tests:**
- [ ] Create prediction z ETH
- [ ] Create prediction z $SWIPE
- [ ] Stake ETH na prediction
- [ ] Stake $SWIPE na prediction
- [ ] Claim ETH rewards
- [ ] Claim $SWIPE rewards
- [ ] Refund po cancel (oba tokeny)

#### **Admin Flow Tests:**
- [ ] Approve/Reject predictions
- [ ] Withdraw ETH fees
- [ ] Withdraw $SWIPE fees
- [ ] Change limits dla obu tokenów
- [ ] Emergency functions

### **7.5. TOKEN HELPERS**
- [ ] **Stworzyć lib/tokenHelpers.ts**
  ```typescript
  // Helper functions dla tokenów
  export const getTokenSymbol = (address: string) => {
    if (address === '0x0000000000000000000000000000000000000000') return 'ETH';
    if (address === SWIPE_TOKEN.address) return 'SWIPE';
    return 'Unknown';
  };
  
  export const formatTokenAmount = (amount: string, token: 'ETH' | 'SWIPE') => {
    // Format z odpowiednią precyzją
  };
  ```

### **8. MIGRATION STRATEGY**

#### **Option 1: Clean Migration**
1. [ ] Pause V1 contract
2. [ ] Resolve all active predictions
3. [ ] Withdraw all funds
4. [ ] Deploy V2
5. [ ] Update frontend to V2 only

#### **Option 2: Dual Support (Complex)**
1. [ ] Deploy V2
2. [ ] Frontend supports both contracts
3. [ ] Gradual migration
4. [ ] Deprecate V1 later

**RECOMMENDED: Option 1 - Clean Migration**

### **9. DEPLOYMENT STEPS**

1. **Pre-Deploy**
   - [ ] Compile contract
   - [ ] Run tests
   - [ ] Prepare deploy script

2. **Deploy**
   - [ ] Compile contract: `npx hardhat compile`
   - [ ] Deploy to Base: `npx hardhat run scripts/deploy_V2.js --network base`
   - [ ] Save deployed contract address
   - [ ] Verify on BaseScan
   - [ ] Configure contract (setSupportedToken, fees, etc.)

3. **Post-Deploy**
   - [ ] Update frontend config
   - [ ] Test all functions
   - [ ] Monitor for issues

### **10. DOCUMENTATION**
- [ ] Update README z nowym adresem
- [ ] Dokumentacja nowych funkcji
- [ ] User guide dla $SWIPE staking

## ⚠️ CRITICAL ITEMS

1. **$SWIPE Token Approval**
   - Users muszą approve kontrakt przed staking
   - Dodać UI dla token approval
   - Check allowance przed każdą transakcją
   - Handle approve w try/catch

2. **Gas Optimization**
   - Batch operations gdzie możliwe
   - Optymalizacja storage reads

3. **Security**
   - Double-check reentrancy guards
   - Test edge cases
   - Audit critical functions

## 🎯 PRIORITY ORDER

1. Compile contract (`npx hardhat compile`)
2. Deploy & Configure Contract (use scripts/deploy_V2.js)
3. Generate & Update ABI w contract.ts
4. Update TinderCard.tsx (główny komponent)
5. Update CreatePredictionModal.tsx
6. Update Claim flows (ActiveBets/BetHistory)
7. Create token helpers
8. Update API endpoints
9. Test everything
10. Final deployment

## 📅 TIMELINE ESTIMATE

- Contract Deploy: 30 min
- Frontend Updates: 2-3 hours
- Testing: 1 hour
- Buffer: 1 hour

**TOTAL: ~5 hours**

---

**Ready for deployment? Let's go! 🚀**
