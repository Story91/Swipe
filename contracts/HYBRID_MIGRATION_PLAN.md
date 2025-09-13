# 🔄 HYBRID MIGRATION PLAN - PredictionMarket V2

## 📋 **STRATEGIA MIGRACJI**

### **Główna Zasada:**
- **V1 kontrakt** - pozostaje w pełni aktywny (wszystkie funkcje działają)
- **V2 kontrakt** - wszystkie nowe predictions, stakes i funkcje
- **Frontend** - domyślnie używa V2, ale pokazuje wszystko z obu kontraktów

## 🎯 **KORZYŚCI HYBRID APPROACH**

✅ **Zero Risk** - użytkownicy nie tracą środków  
✅ **Backward Compatible** - V1 działa dalej  
✅ **Clean UX** - jasne rozróżnienie legacy vs nowe  
✅ **No Data Migration** - nie trzeba przenosić danych  
✅ **Gradual Transition** - naturalne wygaszanie V1  

## 📊 **KONFIGURACJA KONTRAKTÓW**

### **lib/contract.ts - Dual Contract Setup**
```typescript
export const CONTRACTS = {
  V1: {
    address: '0x...', // stary adres V1
    abi: V1_ABI,
    version: 'v1',
    active: true, // w pełni aktywny
    supportedTokens: ['ETH']
  },
  V2: {
    address: '0x...', // nowy adres V2 po deploy
    abi: V2_ABI,
    version: 'v2',
    active: true, // dla nowych predictions
    supportedTokens: ['ETH', 'SWIPE']
  }
};

// Migration date - data deploy V2
export const MIGRATION_DATE = new Date('2024-01-XX');

// Helper functions
export const getContractForPrediction = (createdAt: Date) => {
  return createdAt < MIGRATION_DATE ? CONTRACTS.V1 : CONTRACTS.V2;
};

export const getContractForAction = (action: 'create' | 'stake' | 'claim', predictionId?: string) => {
  if (action === 'create' || action === 'stake') {
    return CONTRACTS.V2; // zawsze V2 dla nowych akcji
  }
  
  // Dla claimów - sprawdzamy datę utworzenia prediction
  // To będzie implementowane w komponentach
  return CONTRACTS.V1; // fallback
};
```

## 🏗️ **FRONTEND ARCHITECTURE**

### **1. User Dashboard - Dual Display**

```typescript
// components/Portfolio/EnhancedUserDashboard.tsx
const UserDashboard = () => {
  const [v1Predictions, setV1Predictions] = useState([]);
  const [v2Predictions, setV2Predictions] = useState([]);
  
  useEffect(() => {
    // Fetch V1 - wszystkie predictions (legacy)
    fetchV1AllPredictions();
    // Fetch V2 - wszystkie aktywne predictions
    fetchV2ActivePredictions();
  }, []);

  return (
    <div className="user-dashboard">
      {/* V1 Legacy Section */}
      {v1Predictions.length > 0 && (
        <div className="legacy-section">
          <h3>All Predictions (V1)</h3>
          <p className="legacy-notice">
            These are from the V1 contract. You can still interact with them normally.
          </p>
          <div className="legacy-cards">
            {v1Predictions.map(pred => (
              <LegacyPredictionCard 
                key={pred.id}
                prediction={pred}
                contract={CONTRACTS.V1}
              />
            ))}
          </div>
        </div>
      )}
      
      {/* V2 Active Section */}
      <div className="active-section">
        <h3>Active Predictions (V2)</h3>
        <div className="modern-cards">
          {v2Predictions.map(pred => (
            <ModernPredictionCard 
              key={pred.id}
              prediction={pred}
              contract={CONTRACTS.V2}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
```

### **2. Styling Differentiation**

```css
/* Portfolio/EnhancedUserDashboard.css */
.legacy-section {
  background: linear-gradient(45deg, #f0f0f0, #e0e0e0);
  border: 2px dashed #666;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 30px;
  opacity: 0.9;
}

.legacy-notice {
  color: #ff6b35;
  font-weight: bold;
  margin-bottom: 15px;
  padding: 10px;
  background: #fff3cd;
  border-radius: 4px;
  border-left: 4px solid #ff6b35;
}

.legacy-cards .prediction-card {
  background: #f9f9f9;
  border-left: 4px solid #ffa500; /* orange border dla V1 */
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.active-section {
  background: linear-gradient(45deg, #667eea, #764ba2);
  border-radius: 12px;
  padding: 20px;
}

.modern-cards .prediction-card {
  background: white;
  border-left: 4px solid #4CAF50; /* green border dla V2 */
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
```

### **3. Smart Contract Interaction**

```typescript
// lib/hooks/useHybridPredictions.ts
export const useHybridPredictions = () => {
  const [v1Contract, setV1Contract] = useState(null);
  const [v2Contract, setV2Contract] = useState(null);
  
  // Nowe predictions - zawsze V2
  const createPrediction = async (data: CreatePredictionData) => {
    return v2Contract.createPredictionWithToken(
      data.question,
      data.description,
      data.category,
      data.imageUrl,
      data.deadline,
      data.resolutionDeadline,
      data.token, // 'ETH' lub 'SWIPE'
      data.tokenAmount
    );
  };
  
  // Nowe stakes - zawsze V2
  const placeStake = async (predictionId: string, amount: string, token: 'ETH' | 'SWIPE', isYes: boolean) => {
    if (token === 'ETH') {
      return v2Contract.placeStake(predictionId, isYes, { value: amount });
    } else {
      return v2Contract.placeStakeWithToken(predictionId, amount, isYes, SWIPE_TOKEN.address);
    }
  };
  
  // Claimy - inteligentny wybór kontraktu
  const claimReward = async (predictionId: string, createdAt: Date, token: 'ETH' | 'SWIPE') => {
    const isV1 = createdAt < MIGRATION_DATE;
    const contract = isV1 ? v1Contract : v2Contract;
    
    if (isV1) {
      // V1 obsługuje tylko ETH
      return contract.claimReward(predictionId);
    } else {
      // V2 obsługuje oba tokeny
      if (token === 'ETH') {
        return contract.claimReward(predictionId);
      } else {
        return contract.claimRewardWithToken(predictionId);
      }
    }
  };
  
  return {
    createPrediction,
    placeStake,
    claimReward,
    v1Contract,
    v2Contract
  };
};
```

## 🔧 **KOMPONENTY DO AKTUALIZACJI**

### **1. TinderCard.tsx - V2 Multi-Token Support**
- [ ] Dodaj wybór tokenu (ETH/$SWIPE)
- [ ] Implementuj approve flow dla $SWIPE
- [ ] Wyświetlaj limity per token
- [ ] Osobne przyciski claim dla każdego tokenu

### **2. CreatePredictionModal.tsx - V2 Token Selection**
- [ ] Dodaj wybór tokenu do płatności
- [ ] Wyświetlaj odpowiednie creation fee
- [ ] Implementuj approve flow dla $SWIPE
- [ ] Używaj V2 contract dla tworzenia

### **3. ActiveBets.tsx / BetHistory.tsx - Dual Support**
- [ ] Pokazuj typ tokenu w stakes
- [ ] Osobne claiming dla ETH i $SWIPE
- [ ] Rozróżniaj V1 vs V2 predictions

### **4. AdminPanel.tsx - Dual Management**
- [ ] Monitoring obu kontraktów
- [ ] Osobne withdraw dla V1 i V2 fees
- [ ] Zarządzanie $SWIPE settings (V2)

## 📡 **API ENDPOINTS - DUAL SUPPORT**

### **app/api/portfolio/route.ts**
```typescript
export async function GET() {
  const [v1Data, v2Data] = await Promise.all([
    getV1PortfolioData(), // tylko nieodebrane claimy
    getV2PortfolioData()  // wszystkie aktywne predictions
  ]);
  
  return Response.json({
    v1: {
      predictions: v1Data.predictions,
      totalUnclaimed: v1Data.totalUnclaimed,
      contractVersion: 'v1',
      status: 'legacy'
    },
    v2: {
      predictions: v2Data.predictions,
      totalStaked: v2Data.totalStaked,
      totalRewards: v2Data.totalRewards,
      contractVersion: 'v2',
      status: 'active'
    },
    combined: {
      totalValue: v1Data.totalValue + v2Data.totalValue,
      activePredictions: v2Data.active,
      legacyClaims: v1Data.unclaimed
    }
  });
}
```

## 🚀 **DEPLOYMENT STEPS**

### **1. Pre-Deploy (V1 pozostaje aktywny)**
- [ ] Compile V2 contract
- [ ] Test V2 functions
- [ ] Prepare dual contract config

### **2. Deploy V2**
- [ ] Deploy V2 to Base: `npx hardhat run scripts/deploy_V2.js --network base`
- [ ] Verify contract on BaseScan
- [ ] Configure V2 (setSupportedToken, fees, etc.)

### **3. Update Frontend**
- [ ] Update lib/contract.ts with dual config
- [ ] Update components for V2 support
- [ ] Add legacy styling
- [ ] Test dual functionality

### **4. Post-Deploy**
- [ ] Monitor both contracts
- [ ] Test user flows
- [ ] Monitor V1 usage decline

## ⏰ **TIMELINE**

- **Contract Deploy:** 30 min
- **Frontend Updates:** 2-3 hours  
- **Testing:** 1 hour
- **Buffer:** 30 min

**TOTAL: ~4 hours**

## 🔍 **MONITORING & DEPRECATION**

### **V1 Usage Tracking**
```typescript
// Monitor V1 contract usage
const trackV1Usage = () => {
  // Track claim transactions
  // Monitor remaining unclaimed rewards
  // Alert when V1 usage drops below threshold
};
```

### **V1 Deprecation Plan**
1. **Month 1-2:** V1 active, V2 primary
2. **Month 3:** V1 warning notices
3. **Month 4:** V1 limited support
4. **Month 6:** V1 deprecated (if no usage)

## ⚠️ **CRITICAL CONSIDERATIONS**

1. **Gas Costs** - użytkownicy płacą za claimy z V1
2. **User Education** - jasne komunikaty o legacy vs nowe
3. **Data Consistency** - synchronizacja między kontraktami
4. **Security** - oba kontrakty muszą być bezpieczne

## 🎯 **SUCCESS METRICS**

- [ ] V2 predictions created successfully
- [ ] V1 claims working properly
- [ ] User adoption of V2 features
- [ ] Gradual V1 usage decline
- [ ] No user fund losses

---

**Ready for Hybrid Migration! 🚀**

*This approach ensures zero risk for users while enabling all new V2 features.*
