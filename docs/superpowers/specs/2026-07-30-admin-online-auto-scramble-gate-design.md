# Admin-Online-Gate für den Auto-Scramble

**Datum:** 2026-07-30
**Plugin-Version:** 3.2.1 → 3.3.0
**Verifiziert gegen:** SquadJS 4.1.0 (`/home/nkiewitt/projekte/SquadJS`, Commit `ee0b4d5`, entspricht Team-Silver-Sphere master)

## 1. Ziel

Eine abschaltbare Option, die den **automatischen** Scramble unterdrückt, solange ein Admin auf
dem Server ist. Die Trigger-Bedingungen selbst bleiben unverändert — nur das Auslösen wird
übersprungen. Idee: ist ein Admin da, entscheidet er selbst per `!scramble`.

Standard ist `false`, das bestehende Verhalten bleibt also für alle bestehenden Configs identisch.

## 2. Scope

**Gegated (3 Trigger):**

| Trigger | Ort |
|---|---|
| Consecutive Wins | `plugins/team-balancer.js:1426` |
| Single Round Margin | `plugins/team-balancer.js:1450` |
| Win Streak Threshold | `plugins/team-balancer.js:1605` + `:1642` |

**Nicht gegated:**

| Pfad | Ort | Grund |
|---|---|---|
| Seed-Auto-Scramble | `:1374` | Beim Seeding ist fast immer ein Admin online — das Gate würde `enableSeedAutoScramble` faktisch abschalten. Der Seed-Scramble ist Routine beim Übergang ins Live-Spiel, kein Eingriff, den ein Admin stattdessen selbst vornehmen würde. |
| `!scramble matchend`-Arm | `:1258` | Admin-initiiert. |
| `!scramble` / `now` / `dry` | `:1095`, `utils/tb-commands.js:636` | Admin-initiiert. |

## 3. Verifizierte SquadJS-Grundlagen

Alle Belegstellen relativ zu `/home/nkiewitt/projekte/SquadJS`.

| Fakt | Belegstelle |
|---|---|
| `server.admins` ist `{ [id]: { permName: true, … } }` | `squad-server/utils/admin-lists.js:80-92` |
| Keys sind steamID **oder** eosID — `/(?<adminID>\d{17}\|[a-f0-9]{32})/` | `admin-lists.js:72` |
| Permission-Namen werden kleingeschrieben abgelegt | `admin-lists.js:81` |
| `server.admins` wird bei jedem `NEW_GAME` neu geladen | `squad-server/index.js:207` (`updateAdmins()`), initial `index.js:74` in `watch()` |
| `server.players[i]` hat `steamID` und `eosID`, aber nur die IDs, die RCON tatsächlich liefert | `squad-server/rcon.js:165`, `core/id-parser.js:6` (`playerIdNames = ['steamID','eosID']`) |
| `ROUND_ENDED` wird unverändert durchgereicht | `squad-server/index.js:315` |
| `server.admins` ist beim Plugin-`mount()` schon geladen | `index.js:17` (`await server.watch()`) vor `index.js:20` (`plugin.mount()`) |
| Neue Option braucht keine Registrierung; `BasePlugin` kopiert nur Keys aus `optionsSpecification` | `squad-server/plugins/base-plugin.js:11-26` |
| `default: false` ohne `required` löst keinen "required equals default"-Throw aus | `base-plugin.js:14-20` |
| `server.players` wird alle 30 s gepollt | `index.js:45` (`updatePlayerListInterval`) |

Weil die Admin-Liste sowohl steamID- als auch eosID-Keys enthalten kann, ist die Prüfung **beider**
IDs eines Spielers zwingend — eine steamID-only-Prüfung greift auf einem Server mit EOS-basierter
`Admins.cfg` überhaupt nicht.

`server.getAdminsWithPermission(perm, 'player')` existiert in 4.1.0 ebenfalls und liefert nur online
Admins (`index.js:377`). Wir nutzen es nicht — siehe Entscheidung 4.2.

## 4. Entscheidungen

### 4.1 Kein Permission-Filter

Jeder Eintrag der Admin-Liste zählt als Admin, unabhängig von seinen Permissions. Das übernimmt die
Methode aus dem Switch-Plugin (`squadjs-switch-teambalancer-aware/switch.js:349`) unverändert.

**Bekannte Konsequenz, bewusst akzeptiert:** SquadJS' Admin-Liste enthält auch
Reserve-Slot-/Whitelist-Gruppen. Ist ein Whitelist-Spieler online, greift das Gate, obwohl kein
echter Admin da ist. Auf einem Server mit großer Whitelist blockiert der Automatismus dadurch
faktisch dauerhaft. Wer das nicht will, lässt die Option auf `false` oder wir ergänzen später einen
Filter auf `canseeadminchat`.

### 4.2 `server.admins` direkt statt `getAdminsWithPermission`

Konsistent mit dem Switch-Plugin und unabhängig von der SquadJS-Version. Der Core-Helper hätte den
Permission-Filter gratis mitgebracht — den wollen wir laut 4.1 nicht — und würde bei einem
unbekannten `type`-Argument werfen. Ein Throw an dieser Stelle landet im `try` von `onRoundEnded`
(`:1231`), dessen `catch` (`:1667`) die Streaks zurücksetzt und ein Fatal-Error-Embed nach Discord
schickt. Der direkte Objektzugriff kann das nicht.

### 4.3 Streak bleibt erhalten

Die Zähler laufen normal weiter, `incrementStreak` wird ausgeführt. Ist am nächsten Rundenende kein
Admin online, feuert der Trigger sofort — die Bedingung ist ja weiter erfüllt. Unterdrückt wird nur
das Auslösen, nicht das Zählen.

### 4.4 Kein RCON-Warn an die Admins

Ohne Permission-Filter (4.1) würde ein Warn auch alle Whitelist-Spieler anschreiben. Stattdessen nur
eine Discord-Report-Nachricht.

## 5. Änderungen

### 5.1 `plugins/team-balancer.js`

**Option** (in `optionsSpecification`, nach `enableSeedAutoScramble`):

```js
skipAutoScrambleWhenAdminOnline: {
  default: false,
  type: 'boolean',
  description: 'Suppress the automatic streak/margin scramble triggers while at least one player from the SquadJS admin list is connected. All trigger conditions stay unchanged — only the firing is skipped. Seed auto-scramble and manual scrambles are unaffected. Requires the server "adminLists" config to be populated.'
}
```

**Version:** `static version = '3.2.1'` → `'3.3.0'` (Zeile 212).

**Admin-Erkennung** (neue Methode, zwischen `isSeedMatch()` (`:532-536`) und `mount()` (`:537`)):

```js
// Mirrors the admin check used by the Switch plugin (server.admins keyed by whatever ID the admin
// list holds), extended to also match eosID-keyed lists — SquadJS accepts both (admin-lists.js
// matches /\d{17}|[a-f0-9]{32}/), so a steamID-only check misses an EOS-based Admins.cfg entirely.
// No permission filter by design: every admin-list entry counts, including reserve/whitelist groups.
// ponytail: reads the 30s-polled server.players — an admin who left <30s ago still blocks. Self-
// corrects at the next round end; call updatePlayerList() here if that ever matters.
_isAdminOnline() {
  const admins = this.server.admins;
  if (!admins) return false;
  const isAdminID = (id) => id != null && Object.prototype.hasOwnProperty.call(admins, id);
  return (this.server.players || []).some((p) => isAdminID(p.steamID) || isAdminID(p.eosID));
}
```

**Gate-Helper** (direkt darunter):

```js
// True when an auto-scramble trigger must stand down because an admin is online. Called as the LAST
// condition of a trigger check, so short-circuiting means it only runs when the trigger would
// otherwise have fired — and the round report then records what was suppressed.
_suppressedByAdminOnline(condition, roundReport) {
  if (!this.options.skipAutoScrambleWhenAdminOnline || !this._isAdminOnline()) return false;
  roundReport.scrambleCondition = `Suppressed (Admin Online): ${condition}`;
  Logger.verbose('TeamBalancer', 2, `[TeamBalancer] Auto-scramble skipped — admin online. Would have fired: ${condition}`);
  const targetReportChannel = this.discordReportChannel || this.discordChannel;
  if (targetReportChannel) {
    DiscordHelpers.sendDiscordMessage(targetReportChannel, {
      content: `⚠️ Auto-Scramble unterdrückt — ein Admin ist online. Auslöser wäre gewesen: **${condition}**. Bei Bedarf \`!scramble\` nutzen.`
    });
  }
  return true;
}
```

**Misconfiguration-Warnung** in `mount()` (nach `this.validateOptions()`, `:544`):

```js
if (this.options.skipAutoScrambleWhenAdminOnline && Object.keys(this.server.admins || {}).length === 0) {
  Logger.verbose('TeamBalancer', 1, '⚠️ skipAutoScrambleWhenAdminOnline is enabled but SquadJS loaded 0 admins — check the server "adminLists" config. The gate can never engage and auto-scramble behaves as if the option were off.');
}
```

**Die vier Trigger-Stellen:**

| Zeile | Vorher | Nachher |
|---|---|---|
| 1426 | `if (this.options.maxConsecutiveWinsWithoutThreshold > 0 && this.consecutiveWinsCount >= …) {` | `… && !this._suppressedByAdminOnline('Consecutive Wins', roundReport)) {` |
| 1450 | `if (this.options.enableSingleRoundScramble && !isInvasion && margin >= …) {` | `… && !this._suppressedByAdminOnline('Single Round Margin', roundReport)) {` |
| 1605 | `const scrambleComing = this.winStreakCount >= this.options.maxWinStreak;` | `const scrambleComing = this.winStreakCount >= this.options.maxWinStreak && !this._suppressedByAdminOnline('Win Streak Threshold', roundReport);` |
| 1642 | `if (this.winStreakCount >= this.options.maxWinStreak) {` | `if (scrambleComing) {` |

Zwischen 1605 und 1642 wird `winStreakCount` nicht mehr verändert (nur Broadcasts), die Umstellung
auf `scrambleComing` ist also verhaltensgleich — und stellt sicher, dass `_isAdminOnline()` pro
Rundenende höchstens einmal pro Trigger läuft.

### 5.2 `utils/tb-commands.js` — Status-Zeile

In `!teambalancer status` (`statusMsg`-Array, `:343`) eine Zeile ergänzen, **nur** wenn die
Option aktiv ist:

```
Admin Gate: ACTIVE (admin online — auto-scramble held)
Admin Gate: ARMED (no admin online)
Admin Gate: ADMIN LIST EMPTY (check adminLists config)
```

Ohne diese Zeile ist für einen Admin im Spiel nicht erkennbar, warum nichts passiert. Der dritte
Zustand macht die Fehlkonfiguration aus 5.1 auch in-game sichtbar.

Analog in `DiscordHelpers.buildStatusEmbed` (`utils/tb-discord-helpers.js:47`).

## 6. Verhalten bei Unterdrückung

- **Broadcast:** Statt der Scramble-Ankündigung geht die normale Dominant-Win-Meldung raus. Das
  ergibt sich automatisch, weil `:1608` auf `!scrambleComing` prüft — keine zusätzliche Änderung.
  Die Spieler bekommen also keine Scramble-Ankündigung, die dann nicht eintritt.
- **Consecutive Wins unterdrückt:** Der Code fällt durch zur Single-Round- und Dominanz-Auswertung
  (dort ebenfalls unterdrückt) und endet in der normalen Win-Meldung. Keine Stille.
- **Round-Report:** `scrambled: false`, `scrambleCondition: "Suppressed (Admin Online): <Trigger>"`.
  Feuern mehrere Trigger im selben Rundenende, gewinnt der zuletzt geprüfte (Win Streak) — der
  relevantere.
- **Bewusste Verhaltensänderung:** Bisher kehrte der Single-Round-Trigger *vor* `incrementStreak`
  (`:1574`) zurück, der Win-Streak wuchs dadurch nicht. Unterdrückt fällt der Code jetzt durch und
  der Streak zählt hoch. Das ist gewollt: es war eine dominante Runde, und der Streak soll den
  nächsten Trigger auslösen.

## 7. Tests — `testing/plugin-logic-test-runner.js`

`mockServer.admins = {}` ergänzen; `mockServer.players` pro Testfall setzen und zurücksetzen.

| # | Setup | Erwartung |
|---|---|---|
| 1 | Option `false`, Admin online | Scramble feuert (Regression) |
| 2 | Option `true`, kein Admin online | Scramble feuert (Regression) |
| 3 | Option `true`, Admin online per **steamID**-Key | Kein Scramble, normale Win-Meldung gebroadcastet, Streak erhalten |
| 4 | Option `true`, Admin online per **eosID**-Key | Kein Scramble |
| 5 | Wie 3, danach Rundenende ohne Admin | Scramble feuert (Streak hat überlebt) |
| 6 | Seed-Runde, Admin online | Seed-Scramble feuert trotzdem (Ausnahme aus §2) |
| 7 | `!scramble` manuell, Admin online | Feuert (nicht gegated) |
| 8 | Eigene Plugin-Instanz, Option `true`, `server.admins = {}` | Kein Gate (Scramble feuert); `mount()` loggt die Warnung aus 5.1 |

Fall 4 ist der wichtigste — er deckt genau den Bug ab, den die steamID-only-Prüfung des
Switch-Plugins hat.

## 8. Doku

- Header-Kommentar in `plugins/team-balancer.js`: NOTES-Abschnitt, CONFIGURATION-Liste (unter
  "Core") und das Beispiel-JSON.
- `README.md`: Zeile unter "Configuration Options → Core Settings" (nach `enableSeedAutoScramble`,
  `:237`) und im Beispiel-JSON (`:142`).
- Beide Stellen müssen den `adminLists`-Vorbehalt aus §9 nennen.

## 9. Risiken und Vorbehalte

1. **`adminLists` muss konfiguriert sein.** Ist `server.adminLists` leer oder Platzhalter, gibt
   `fetchAdminLists` `{}` zurück (`admin-lists.js:60` → `catch` → leer) und das Gate greift nie. Vom
   Nutzer für die Produktiv-Config bestätigt. SquadJS hat keine andere "Admin ist online"-Quelle;
   `server.adminsInAdminCam` erfasst nur Admin-Cam. Die Warnung aus 5.1 macht den Fall sichtbar.
2. **Whitelist-Spieler blockieren** — siehe 4.1, bewusst akzeptiert.
3. **30 s Poll-Latenz** auf `server.players` — siehe `ponytail:`-Kommentar in 5.1. Der Fehler geht in
   beide Richtungen und korrigiert sich am nächsten Rundenende.
4. **Groß-/Kleinschreibung der eosIDs:** `admin-lists.js:72` akzeptiert nur `[a-f0-9]{32}`. Liefert
   RCON je eine eosID in Großschreibung, greift der Lookup nicht — der SquadJS-Core vergleicht an
   `index.js:348` aber genauso, also wäre dann auch die Admin-Erkennung des Cores betroffen. Kein
   zusätzliches Risiko durch diese Änderung.
