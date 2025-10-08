# 📚 INSTRUKCJA: Kupowanie Tokena $SLOT przez Flaunch SDK

## 🎯 Przegląd
Aplikacja Gambly wykorzystuje **Flaunch SDK** do kupowania i sprzedawania tokena $SLOT. Flaunch to DEX agregator na Base, który automatycznie znajduje najlepsze ceny i zarządza swapami.

---

## 🏗️ Architektura

### Kluczowe Komponenty:
1. **SlotTokenCard.tsx** - główny komponent do kupowania tokenów (Quick Buy buttons)
2. **GamblingCard.tsx** - zawiera pełny modal swap z opcjami buy/sell/DEX
3. **Flaunch SDK** - `@flaunch/sdk` - pakiet do komunikacji z DEX

### Adresy Kontraktów (Base Mainnet):
```typescript
ERC20_ADDRESS (SLOT Token): 0xbb97f8257cd4ba47ae5c979afcf12eb19d1723e8
GAMBLING_ADDRESS: 0x7d0CF0F993568c38061942f8Eaaa3B2ec084441B
CLAIM_ADDRESS: 0xeaded0048371ecc5f93c8cdba0a9c1f147cac695
Liquidity Pool (LP): 0x498581ff718922c3f8e6a244956af099b2652b2b
```

---

## 🔧 Inicjalizacja Flaunch SDK

### 1. Instalacja
```bash
npm install @flaunch/sdk
```

### 2. Inicjalizacja w komponencie
```typescript
import { createFlaunch, ReadWriteFlaunchSDK } from "@flaunch/sdk";
import { usePublicClient, useWalletClient } from "wagmi";

const publicClient = usePublicClient();
const { data: walletClient } = useWalletClient();

const flaunchSDK = useMemo(() => {
  if (!publicClient || !walletClient) return null;

  return createFlaunch({
    publicClient,
    walletClient,
  }) as ReadWriteFlaunchSDK;
}, [publicClient, walletClient]);
```

**Wymagania:**
- `publicClient` - do czytania danych z blockchainu
- `walletClient` - do podpisywania transakcji
- Oba pochodzą z wagmi hooks

---

## 💰 Kupowanie Tokenów - Funkcja buyWithETH()

### Kod Kompletny:
```typescript
const buyWithETH = useCallback(async () => {
  if (!flaunchSDK || !address) {
    await sendNotification({
      title: "Error",
      body: "Wallet not connected or SDK not ready",
    });
    return;
  }

  setIsLoading(true);
  setTransactionHash(null);

  try {
    // KROK 1: Wywołaj buyCoin z Flaunch SDK
    const hash = await flaunchSDK.buyCoin({
      coinAddress: CONTRACTS.ERC20_ADDRESS,  // Adres tokena
      slippagePercent: 5,                     // Tolerancja poślizgu (1-10%)
      swapType: "EXACT_IN",                   // Typ: dokładna kwota ETH
      amountIn: parseEther("0.001"),          // Kwota ETH do wymiany
    });

    setTransactionHash(hash);

    // KROK 2: Czekaj na potwierdzenie
    const receipt = await flaunchSDK.drift.waitForTransaction({ hash });

    // KROK 3: Sprawdź status
    if (receipt && receipt.status === "success") {
      await sendNotification({
        title: "🎉 Purchase Successful!",
        body: `Successfully bought SLOT tokens! TX: ${hash.slice(0, 10)}...`,
      });

      // KROK 4: Odśwież saldo
      refetchBalance();

      setTimeout(() => {
        setTransactionHash(null);
      }, 5000);
    } else {
      throw new Error("Transaction failed");
    }
  } catch (error) {
    console.error("Buy failed:", error);
    await sendNotification({
      title: "❌ Purchase Failed",
      body: error instanceof Error ? error.message : "Transaction failed",
    });
  } finally {
    setIsLoading(false);
  }
}, [flaunchSDK, address, sendNotification, refetchBalance]);
```

---

## 📊 Parametry flaunchSDK.buyCoin()

```typescript
{
  coinAddress: string;        // Adres tokena ERC20 do kupienia
  slippagePercent: number;    // 1-10% - tolerancja poślizgu ceny
  swapType: "EXACT_IN";       // Typ swapu (dokładna kwota na wejściu)
  amountIn: bigint;           // Kwota ETH w wei (użyj parseEther())
}
```

**Co SDK robi automatycznie:**
- ✅ Znajduje najlepszą pulę płynności (LP)
- ✅ Oblicza ile tokenów $SLOT otrzymasz
- ✅ Wykonuje swap przez router Flaunch
- ✅ Stosuje slippage protection
- ✅ Czeka na potwierdzenie transakcji

---

## 🎨 UI Implementation - Quick Buy Buttons

```typescript
{/* Quick Buy 0.0001 ETH */}
<button
  onClick={() => {
    setBuyAmount("0.0001");
    buyWithETH();
  }}
  disabled={isLoading || !flaunchSDK || !address}
  className="bg-gradient-to-r from-green-500 to-emerald-600 text-white px-3 py-2 rounded-lg"
>
  <div className="text-center">
    {isLoading ? (
      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mx-auto"></div>
    ) : (
      <>
        <div className="flex justify-center mb-1">
          <Image src="/eth.svg" alt="ETH" width={16} height={16} />
        </div>
        <div>0.0001</div>
      </>
    )}
  </div>
</button>
```

**Mamy 3 przyciski:**
- 0.0001 ETH (zielony)
- 0.001 ETH (niebieski)
- 0.01 ETH (fioletowy)

---

## 💸 Sprzedawanie Tokenów - Z PERMIT2

### Funkcja sellSLOTTokens() z gasless approvals:

```typescript
const sellSLOTTokens = useCallback(async () => {
  if (!flaunchSDK || !address) {
    return;
  }

  setIsLoading(true);
  setTransactionHash(null);

  try {
    const amountIn = parseEther(sellAmount);

    // KROK 1: Sprawdź allowance przez Permit2
    const { allowance } = await flaunchSDK.getPermit2AllowanceAndNonce(
      CONTRACTS.ERC20_ADDRESS
    );

    if (allowance < amountIn) {
      // KROK 2: Potrzebny permit - poproś o podpis
      const { typedData, permitSingle } =
        await flaunchSDK.getPermit2TypedData(CONTRACTS.ERC20_ADDRESS);

      await sendNotification({
        title: "🔐 Signature Required",
        body: "Please sign the permit to allow token sale",
      });

      signTypedData(typedData);

      // Czekaj na signature
      await new Promise((resolve) => {
        const checkSignature = () => {
          if (signature) {
            resolve(signature);
          } else {
            setTimeout(checkSignature, 100);
          }
        };
        checkSignature();
      });

      if (!signature) {
        throw new Error("Signature required for token sale");
      }

      // KROK 3: Sprzedaj z permit
      const hash = await flaunchSDK.sellCoin({
        coinAddress: CONTRACTS.ERC20_ADDRESS,
        amountIn,
        slippagePercent,
        permitSingle,
        signature,
      });

      setTransactionHash(hash);
    } else {
      // Już approved - sprzedaj bezpośrednio
      const hash = await flaunchSDK.sellCoin({
        coinAddress: CONTRACTS.ERC20_ADDRESS,
        amountIn,
        slippagePercent,
      });

      setTransactionHash(hash);
    }

    // Czekaj na potwierdzenie
    const receipt = await flaunchSDK.drift.waitForTransaction({
      hash: transactionHash as \`0x${string}\`,
    });

    if (receipt && receipt.status === "success") {
      await sendNotification({
        title: "🎉 Sale Successful!",
        body: \`Successfully sold SLOT tokens!\`,
      });

      refetchBalance();
    }
  } catch (error) {
    console.error("Sell failed:", error);
  } finally {
    setIsLoading(false);
  }
}, [flaunchSDK, address, sellAmount, slippagePercent, signature]);
```

**Permit2 = Gasless Approvals:**
- User podpisuje wiadomość zamiast robić transakcję approval
- Oszczędza gas
- Bardziej UX-friendly

---

## 🔄 Flow Kupowania (Krok po kroku)

```
1. USER CLICKS "Quick Buy 0.001 ETH"
   ↓
2. setBuyAmount("0.001")
   ↓
3. buyWithETH() wywołane
   ↓
4. flaunchSDK.buyCoin({
     coinAddress: "0xbb97f8257cd4ba47ae5c979afcf12eb19d1723e8",
     slippagePercent: 5,
     swapType: "EXACT_IN",
     amountIn: parseEther("0.001")  // 1000000000000000 wei
   })
   ↓
5. Flaunch SDK:
   - Znajduje LP: 0x498581ff718922c3f8e6a244956af099b2652b2b
   - Oblicza ile $SLOT user dostanie za 0.001 ETH
   - Tworzy transakcję swap
   - Wallet popup: user podpisuje transakcję
   ↓
6. Transakcja wysłana na Base blockchain
   ↓
7. flaunchSDK.drift.waitForTransaction({ hash })
   - SDK czeka na potwierdzenie (polling)
   ↓
8. receipt.status === "success"
   ↓
9. Notification: "🎉 Purchase Successful!"
   ↓
10. refetchBalance() - odświeża saldo $SLOT użytkownika
    ↓
11. UI update: nowe saldo widoczne
```

---

## 📦 Ładowanie Metadanych Tokena

```typescript
const loadCoinMetadata = useCallback(async () => {
  if (!flaunchSDK) return;

  try {
    const metadata = await flaunchSDK.getCoinMetadata(CONTRACTS.ERC20_ADDRESS);
    setCoinMetadata(metadata);
    console.log("Loaded coin metadata:", metadata);
  } catch (error) {
    console.error("Failed to load coin metadata:", error);
  }
}, [flaunchSDK]);

// Wywołaj w useEffect
useEffect(() => {
  loadCoinMetadata();
}, [loadCoinMetadata]);
```

**Pobiera:**
- `symbol`: "SLOT"
- `name`: "Gambly Slot Token"
- `image`: URL do ikony tokena

---

## 🎯 Slippage Tolerance UI

```typescript
const [slippagePercent, setSlippagePercent] = useState(5);

{/* Slippage Settings */}
<div className="bg-gray-50 rounded-lg p-4">
  <label className="block text-sm font-medium text-gray-700 mb-2">
    Slippage Tolerance: {slippagePercent}%
  </label>
  <div className="flex space-x-2">
    {[1, 3, 5, 10].map((percent) => (
      <button
        key={percent}
        onClick={() => setSlippagePercent(percent)}
        className={\`px-3 py-1 rounded text-xs font-medium transition-colors \${
          slippagePercent === percent
            ? "bg-blue-600 text-white"
            : "bg-white text-gray-700 border border-gray-300"
        }\`}
        disabled={isLoading}
      >
        {percent}%
      </button>
    ))}
  </div>
</div>
```

---

## 🔗 Alternatywne DEX (Uniswap Links)

```typescript
{/* ETH → SLOT via Uniswap */}
<a
  href={\`https://app.uniswap.org/#/swap?inputCurrency=ETH&outputCurrency=\${CONTRACTS.ERC20_ADDRESS}&chain=base\`}
  target="_blank"
  rel="noopener noreferrer"
  className="block w-full bg-gradient-to-r from-pink-500 to-purple-600 text-white p-4 rounded-lg"
>
  <div className="flex items-center justify-center space-x-2">
    <span>🦄</span>
    <span>Swap ETH → SLOT on Uniswap</span>
    <span>↗️</span>
  </div>
</a>

{/* USDC → SLOT via Uniswap */}
<a
  href={\`https://app.uniswap.org/#/swap?inputCurrency=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913&outputCurrency=\${CONTRACTS.ERC20_ADDRESS}&chain=base\`}
  target="_blank"
  rel="noopener noreferrer"
  className="block w-full bg-gradient-to-r from-green-500 to-blue-600 text-white p-4 rounded-lg"
>
  <div className="flex items-center justify-center space-x-2">
    <span>🦄</span>
    <span>Swap USDC → SLOT on Uniswap</span>
    <span>↗️</span>
  </div>
</a>

{/* DexScreener */}
<a
  href={\`https://dexscreener.com/base/\${CONTRACTS.ERC20_ADDRESS}\`}
  target="_blank"
  rel="noopener noreferrer"
  className="block w-full bg-gray-600 text-white p-3 rounded-lg"
>
  <div className="flex items-center justify-center space-x-2">
    <span>📊</span>
    <span>View SLOT on DexScreener</span>
    <span>↗️</span>
  </div>
</a>
```

**USDC Address na Base:** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

---

## 📱 Notyfikacje (OnchainKit MiniKit)

```typescript
import { useNotification } from "@coinbase/onchainkit/minikit";

const sendNotification = useNotification();

// Sukces
await sendNotification({
  title: "🎉 Purchase Successful!",
  body: \`Successfully bought SLOT tokens! TX: \${hash.slice(0, 10)}...\`,
});

// Błąd
await sendNotification({
  title: "❌ Purchase Failed",
  body: error instanceof Error ? error.message : "Transaction failed",
});

// Info
await sendNotification({
  title: "🔐 Signature Required",
  body: "Please sign the permit to allow token sale",
});
```

---

## 🧪 Testing Flow

### 1. Testuj na Base Sepolia (testnet):
```typescript
ERC20_ADDRESS: "0x..." // testnet address
```

### 2. Użyj małych kwot:
- 0.0001 ETH
- 0.001 ETH

### 3. Sprawdź transakcje:
- BaseScan: `https://basescan.org/tx/${txHash}`
- Base Sepolia: `https://sepolia.basescan.org/tx/${txHash}`

---

## ⚠️ Error Handling

```typescript
try {
  const hash = await flaunchSDK.buyCoin({...});
  const receipt = await flaunchSDK.drift.waitForTransaction({ hash });
  
  if (receipt && receipt.status === "success") {
    // Sukces
  } else {
    throw new Error("Transaction failed");
  }
} catch (error) {
  console.error("Buy failed:", error);
  
  // Różne typy błędów:
  if (error.message.includes("user rejected")) {
    // User odrzucił transakcję
  } else if (error.message.includes("insufficient funds")) {
    // Za mało ETH
  } else if (error.message.includes("slippage")) {
    // Zbyt duży poślizg - zwiększ slippage tolerance
  }
  
  await sendNotification({
    title: "❌ Purchase Failed",
    body: error.message,
  });
}
```

---

## 🎁 Bonus: Claim Feature

Użytkownicy mogą claimować darmowe tokeny $SLOT przy pierwszym użyciu:

```typescript
// Claim.tsx
const { data: hasClaimed } = useReadContract({
  address: CONTRACTS.CLAIM_ADDRESS,
  abi: CLAIM_CONTRACT_ABI,
  functionName: "claimed",
  args: [address],
});

const claimCalls = useMemo(() => {
  return [{
    to: CONTRACTS.CLAIM_ADDRESS,
    data: encodeFunctionData({
      abi: CLAIM_CONTRACT_ABI,
      functionName: "claim",
    }),
    value: BigInt(0),
  }];
}, [address]);
```

**Claim Amount:** 100,000 $SLOT (100k)

---

## 📝 Kluczowe Dependencies

```json
{
  "@flaunch/sdk": "^0.8.2",
  "@coinbase/onchainkit": "latest",
  "wagmi": "^2.14.11",
  "viem": "^2.27.2",
  "react": "^18"
}
```

---

## 🔑 Kluczowe Hooks Wagmi

```typescript
import { 
  useAccount,           // Adres walleta i status połączenia
  useReadContract,      // Czytanie danych z kontraktu
  useWalletClient,      // Client do podpisywania transakcji
  usePublicClient,      // Client do czytania blockchainu
  useSignTypedData      // Podpisywanie Permit2
} from "wagmi";
```

---

## 🚀 Podsumowanie

**Flaunch SDK automatycznie obsługuje:**
- 🔍 Znajdowanie najlepszego LP (Liquidity Pool)
- 💱 Obliczanie cen i slippage
- ⛽ Gas estimation
- 🔐 Permit2 dla gasless approvals (sell)
- ✅ Transaction management & confirmations
- 🔄 Quote updates w czasie rzeczywistym

**Twoja rola:**
1. Zainicjalizuj SDK z publicClient i walletClient
2. Wywołaj `flaunchSDK.buyCoin()` z parametrami
3. Czekaj na receipt
4. Odśwież UI

**To wszystko! SDK robi ciężką robotę za Ciebie.** 🎉

---

## 📞 Linki

- **Flaunch Platform:** https://flaunch.gg
- **Token na Flaunch:** https://flaunch.gg/base/coin/0xbb97f8257cd4ba47ae5c979afcf12eb19d1723e8
- **BaseScan Token:** https://basescan.org/token/0xbb97f8257cd4ba47ae5c979afcf12eb19d1723e8
- **DexScreener:** https://dexscreener.com/base/0xbb97f8257cd4ba47ae5c979afcf12eb19d1723e8
- **Liquidity Pool:** https://basescan.org/address/0x498581ff718922c3f8e6a244956af099b2652b2b

---

**Created for Gambly App | Base Blockchain | Flaunch SDK Integration**

