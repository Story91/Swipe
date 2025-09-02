# AI Assistant Setup Guide

## Konfiguracja OpenAI API

Aby asystent AI działał poprawnie, musisz skonfigurować klucz API OpenAI:

### 1. Utwórz plik .env.local w głównym katalogu projektu:

```bash
# .env.local
OPENAI_API_KEY=your_actual_openai_api_key_here
```

### 2. Pobierz klucz API OpenAI:
- Przejdź do [OpenAI Platform](https://platform.openai.com/api-keys)
- Zaloguj się lub utwórz konto
- Utwórz nowy klucz API
- Skopiuj klucz i wklej go w pliku .env.local

### 3. Uruchom aplikację:
```bash
npm run dev
```

## Funkcjonalności Asystenta AI

Asystent AI znajduje się w prawym dolnym rogu strony głównej i oferuje:

- **Ikona Bot** z animowaną czerwoną kropką (Sparkles)
- **Modal z wydarzeniami na żywo** - rzeczywiste wydarzenia z dnia dzisiejszego i przyszłości
- **Live Web Search** - wyszukiwanie w czasie rzeczywistym najnowszych informacji
- **Kategorie wydarzeń**: Crypto, Economy, Technology, Politics (max 3 wydarzenia na kategorię)
- **Poziomy wpływu**: High, Medium, Low (z kolorowym kodowaniem)
- **Źródła danych**: Oznaczenie "🔴 Live" dla danych z wyszukiwania na żywo
- **Automatyczne odświeżanie** z nowymi wyszukiwaniami
- **Fallback data** w przypadku błędu API

## Struktura Plików

- `app/components/AIAssistant/AIAssistant.tsx` - główny komponent asystenta
- `app/api/ai-assistant/daily-events/route.ts` - API endpoint używający OpenAI GPT-5-nano z Live Web Search
- `app/page.tsx` - integracja z główną stroną

## Live Web Search Features

- **Real-time Data**: Wyszukiwanie najnowszych informacji z internetu
- **Category-based Search**: Specjalizowane zapytania dla każdej kategorii
- **Live Sources**: Oznaczenie "🔴 Live" dla danych z wyszukiwania na żywo
- **Max 3 Events per Category**: Optymalizacja dla szybkiego ładowania
- **Automatic Fallback**: Działanie nawet przy błędach wyszukiwania

## Bezpieczeństwo

- Klucz API jest przechowywany w zmiennych środowiskowych
- API endpoint jest chroniony przed nieautoryzowanym dostępem
- Fallback data zapewnia działanie nawet przy błędach API
- Web search jest ograniczony do publicznych źródeł informacji

## Dostosowanie

Możesz dostosować:
- Model AI (obecnie GPT-5-nano)
- Liczbę wydarzeń (obecnie max 3 na kategorię)
- Kategorie wydarzeń (Crypto, Economy, Technology, Politics)
- Style i kolory interfejsu
- Częstotliwość wyszukiwania na żywo
- Zapytania wyszukiwania dla każdej kategorii
