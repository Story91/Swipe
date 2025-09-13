# 🚀 HYBRID MIGRATION TODOS - PredictionMarket V2

## 📊 **HYBRID STRATEGY OVERVIEW**

**V1 Contract** - pozostaje w pełni aktywny (wszystkie funkcje działają)  
**V2 Contract** - wszystkie nowe predictions, stakes i funkcje  
**Frontend** - domyślnie używa V2, ale pokazuje wszystko z obu kontraktów  

## 🎯 **DEPLOYMENT PHASE**

### **1. SMART CONTRACT DEPLOYMENT**
- [ ] **Compile V2 contract**
  ```bash
  npx hardhat compile
  ```
- [ ] **Deploy V2 to Base**
  ```bash
  npx hardhat run scripts/deploy_V2.js --network base
  ```
- [ ] **Verify contract on BaseScan**
- [ ] **Configure V2 contract:**
  - [ ] `setSupportedToken(0xd0187D77Af0ED6a44F0A631B406c78b30E160aA9, true)` // $SWIPE
  - [ ] `setCreationFee(ETH_ADDRESS, 0.0001 ether)`
  - [ ] `setCreationFee(swipeAddress, 200000 * 10**18)`
  - [ ] `setApprover(owner, true)` // owner jako approver
  - [ ] `setPublicCreation(true)` // publiczne tworzenie

### **2. CONTRACT CONFIGURATION**
- [ ] **Save V2 contract address**
- [ ] **Generate V2 ABI** (z artifacts/)
- [ ] **Test V2 functions** (create, stake, claim)
- [ ] **Verify $SWIPE token integration**

## 🔧 **FRONTEND UPDATES**

### **3. DUAL CONTRACT CONFIGURATION**
- [ ] **Update lib/contract.ts**
  ```typescript
  export const CONTRACTS = {
    V1: {
      address: '0x...', // stary adres V1
      abi: V1_ABI,
      version: 'v1',
      active: true
    },
    V2: {
      address: '0x...', // nowy adres V2
      abi: V2_ABI,
      version: 'v2',
      active: true
    }
  };
  
  export const MIGRATION_DATE = new Date('2024-01-XX');
  ```
- [ ] **Create migration helpers**
  ```typescript
  export const getContractForPrediction = (createdAt: Date) => {
    return createdAt < MIGRATION_DATE ? CONTRACTS.V1 : CONTRACTS.V2;
  };
  ```

### **4. CORE COMPONENTS - V2 SUPPORT**

#### **A. TinderCard.tsx - Multi-Token Staking**
- [ ] **Import SWIPE_TOKEN** z lib/contract.ts
- [ ] **Add token selection UI** (ETH/$SWIPE toggle)
- [ ] **Implement approve flow** dla $SWIPE przed staking
- [ ] **Display token limits** (ETH: 0.00001-100, SWIPE: 10,000-unlimited)
- [ ] **Separate claim buttons** dla każdego tokenu
- [ ] **Use V2 contract** dla wszystkich nowych stakes
- [ ] **Handle dual pools** (ETH pool + $SWIPE pool)

#### **B. CreatePredictionModal.tsx - Token Payment**
- [ ] **Import SWIPE_TOKEN** z lib/contract.ts
- [ ] **Add token selection** dla creation fee
- [ ] **Display creation fees** (ETH: 0.0001, SWIPE: 200,000)
- [ ] **Implement approve flow** dla $SWIPE
- [ ] **Use V2 contract** dla tworzenia predictions
- [ ] **Handle createPredictionWithToken()** dla $SWIPE

#### **C. UserDashboard - Dual Display**
- [ ] **Create LegacyCard component** dla V1 predictions
- [ ] **Create ModernCard component** dla V2 predictions
- [ ] **Add legacy section** z V1 predictions
- [ ] **Add active section** z V2 predictions
- [ ] **Implement dual data fetching**
- [ ] **Add legacy styling** (dashed border, orange accent)
- [ ] **Add modern styling** (gradient background, green accent)

#### **D. ActiveBets.tsx / BetHistory.tsx - Token Awareness**
- [ ] **Show token type** w stakes (ETH/$SWIPE)
- [ ] **Separate claiming** dla ETH i $SWIPE
- [ ] **Distinguish V1 vs V2** predictions
- [ ] **Handle dual contract claims**
- [ ] **Display legacy vs modern styling**

### **5. ADMIN PANEL - DUAL MANAGEMENT**
- [ ] **Add V1 monitoring** (remaining claims, usage)
- [ ] **Add V2 management** ($SWIPE settings, limits)
- [ ] **Separate withdraw functions** (V1 fees vs V2 fees)
- [ ] **Dual contract analytics**
- [ ] **Migration status dashboard**

## 📡 **API ENDPOINTS - DUAL SUPPORT**

### **6. BACKEND UPDATES**

#### **A. app/api/portfolio/route.ts**
- [ ] **Fetch V1 data** (wszystkie predictions)
- [ ] **Fetch V2 data** (wszystkie aktywne predictions)
- [ ] **Combine data** w response
- [ ] **Add contract version info**
- [ ] **Handle dual claiming logic**

#### **B. app/api/predictions/route.ts**
- [ ] **Use V2 contract** dla nowych predictions
- [ ] **Store token type** w Redis cache
- [ ] **Handle multi-token stakes**
- [ ] **Update prediction creation** dla V2

#### **C. app/api/stakes/route.ts**
- [ ] **Distinguish ETH vs $SWIPE** stakes
- [ ] **Validate limits per token**
- [ ] **Use V2 contract** dla nowych stakes
- [ ] **Handle dual token validation**

### **7. REDIS/CACHE UPDATES**
- [ ] **Update lib/types/redis.ts**
  ```typescript
  interface Prediction {
    // ... existing fields
    tokenType?: 'ETH' | 'SWIPE';
    contractVersion?: 'v1' | 'v2';
  }
  ```
- [ ] **Update lib/redis-utils.ts**
  - [ ] Dual contract sync logic
  - [ ] Token type handling
  - [ ] Version tracking

## 🎨 **STYLING & UX**

### **8. VISUAL DIFFERENTIATION**
- [ ] **Legacy styling** (V1 predictions)
  - [ ] Dashed border
  - [ ] Orange accent color
  - [ ] Reduced opacity
  - [ ] Warning notices
- [ ] **Modern styling** (V2 predictions)
  - [ ] Gradient backgrounds
  - [ ] Green accent color
  - [ ] Enhanced shadows
  - [ ] Modern animations

### **9. USER COMMUNICATION**
- [ ] **Legacy notices** - "V1 predictions - fully functional"
- [ ] **Migration info** - "New features in V2"
- [ ] **Token education** - "$SWIPE staking available"
- [ ] **Help documentation** - dual contract guide

## 🧪 **TESTING CHECKLIST**

### **10. USER FLOW TESTS**

#### **V1 Legacy Tests:**
- [ ] **Create V1 prediction** (ETH only)
- [ ] **Stake on V1 prediction** (ETH only)
- [ ] **Claim V1 rewards** (ETH only)
- [ ] **View V1 predictions** w legacy styling
- [ ] **Legacy dashboard** functionality

#### **V2 Modern Tests:**
- [ ] **Create prediction** z ETH
- [ ] **Create prediction** z $SWIPE
- [ ] **Stake ETH** na V2 prediction
- [ ] **Stake $SWIPE** na V2 prediction
- [ ] **Claim ETH rewards** z V2
- [ ] **Claim $SWIPE rewards** z V2
- [ ] **Token approval** flow dla $SWIPE

#### **Hybrid Tests:**
- [ ] **Dual dashboard** display
- [ ] **Contract selection** logic
- [ ] **Data consistency** między kontraktami
- [ ] **User experience** flow

### **11. ADMIN FLOW TESTS**
- [ ] **V1 monitoring** (usage, claims)
- [ ] **V2 management** (settings, limits)
- [ ] **Dual analytics** (both contracts)
- [ ] **Fee withdrawal** (V1 vs V2)

## 📊 **MONITORING & ANALYTICS**

### **12. USAGE TRACKING**
- [ ] **V1 usage metrics** (claims per day)
- [ ] **V2 adoption** (new predictions, stakes)
- [ ] **Token usage** (ETH vs $SWIPE)
- [ ] **User migration** patterns

### **13. ALERTING**
- [ ] **V1 low usage** alerts
- [ ] **V2 error** monitoring
- [ ] **Token approval** failures
- [ ] **Contract interaction** errors

## 🔄 **MIGRATION TIMELINE**

### **Phase 1: Deploy (Day 1)**
- [ ] Deploy V2 contract
- [ ] Update contract configuration
- [ ] Test basic V2 functions

### **Phase 2: Frontend (Day 2-3)**
- [ ] Update core components
- [ ] Implement dual support
- [ ] Add styling differentiation

### **Phase 3: Testing (Day 4)**
- [ ] Comprehensive testing
- [ ] User flow validation
- [ ] Bug fixes

### **Phase 4: Launch (Day 5)**
- [ ] Production deployment
- [ ] User communication
- [ ] Monitoring setup

## ⚠️ **CRITICAL ITEMS**

1. **$SWIPE Token Approval**
   - [ ] Users must approve contract before staking
   - [ ] Add UI for token approval
   - [ ] Check allowance before transactions
   - [ ] Handle approve errors gracefully

2. **Contract Selection Logic**
   - [ ] Accurate date-based contract selection
   - [ ] Fallback handling for edge cases
   - [ ] Error handling for contract calls

3. **Data Consistency**
   - [ ] Sync between V1 and V2 data
   - [ ] Handle contract state changes
   - [ ] Maintain user experience continuity

4. **Security**
   - [ ] Both contracts must be secure
   - [ ] No fund mixing between contracts
   - [ ] Proper access controls

## 🎯 **SUCCESS METRICS**

- [ ] V2 predictions created successfully
- [ ] V1 claims working properly
- [ ] User adoption of V2 features
- [ ] Gradual V1 usage decline
- [ ] No user fund losses
- [ ] Smooth user experience

## 📅 **ESTIMATED TIMELINE**

- **Contract Deploy:** 30 min
- **Frontend Updates:** 2-3 hours
- **Testing:** 1 hour
- **Buffer:** 30 min

**TOTAL: ~4 hours**

---

**Ready for Hybrid Migration! 🚀**

*This approach ensures zero risk for users while enabling all new V2 features.*
