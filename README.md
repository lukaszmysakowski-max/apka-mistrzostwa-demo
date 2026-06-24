# MVP klient offline OMRM

Ten folder zawiera statyczna aplikacje PWA przygotowana jako fundament klienta sedziowskiego.

## Najprostsze uruchomienie demo na Windows

Kliknij dwukrotnie:

```text
Uruchom demo.cmd
```

Skrypt uruchomi lokalny serwer bez Pythona i otworzy przeglądarkę pod adresem:

```text
http://127.0.0.1:4173/
```

Zamknięcie okna skryptu zatrzyma podgląd.

Skrypt używa lokalnego Node.js z runtime Codex, jeżeli jest dostępny. Jeśli go nie znajdzie, spróbuje użyć Node.js z systemu. Jeśli nie znajdzie żadnego Node.js, otworzy awaryjny plik `demo-standalone.html` i pokaże prostą instrukcję dla użytkownika.

W aktualnym demo ekran karty zawiera mały licznik czasu konkurencji w lewym górnym obszarze interfejsu sędziego. Licznik nie startuje automatycznie po rozpoczęciu oceny; startuje dopiero po kliknięciu `Start`. Czas jest konfigurowany per konkurencja albo karta przez pole `timer.durationSeconds`. Domyślnie demo używa 10:00. Dostępne są też przyciski Start, Pauza, Wznów, Reset oraz przełącznik dźwięku.

## Dostępne szablony kart demo

Aktualnie w demo pozostawiono tylko jedna karte oceny:

- `card-template-zwirownia-2026.json`.

Po wybraniu zespołu lista `Konkurencja / karta` pokazuje kartę przypisaną w `data/demo-data.json`. Wybór karty nie wymaga zmian w `app.js`.

## Uruchomienie reczne

Aplikacja korzysta z modułów JavaScript oraz pobiera konfigurację z katalogu `data`, dlatego pełne PWA należy uruchomić przez serwer HTTP. Bez instalowania Pythona można użyć Node.js:

```powershell
node demo-server.mjs 4173
```

Następnie wejdź na:

```text
http://127.0.0.1:4173/
```

Alternatywa dla nietechnicznego uruchomienia: otworz folder w VS Code, kliknij prawym przyciskiem `index.html` i wybierz `Open with Live Server`.

## Tryb demo

Tryb demo jest włączony jednym parametrem w `data/app-config.json`:

```json
{
  "demoMode": {
    "enabled": true,
    "source": "demo-data.json"
  }
}
```

Zmiana `enabled` na `false` wyłącza ładowanie przykładowych zespołów, ról, konkurencji, wyników, audytu i kolejki synchronizacji. Dane produkcyjne nadal powinny przyjść z API albo z docelowych plików konfiguracyjnych w `data`. Lokalny zapis jest traktowany jako cache offline i kolejka operacji do synchronizacji.
