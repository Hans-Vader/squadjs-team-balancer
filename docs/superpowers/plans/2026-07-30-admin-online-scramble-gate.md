# Admin-Online-Gate für den Auto-Scramble — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine abschaltbare Option `skipAutoScrambleWhenAdminOnline`, die die drei streak-/margin-basierten Auto-Scramble-Trigger unterdrückt, solange ein Spieler aus der SquadJS-Admin-Liste verbunden ist.

**Architecture:** Zwei private Methoden auf `TeamBalancer` — `_isAdminOnline()` liest `server.admins` gegen `server.players`, `_suppressedByAdminOnline()` kapselt Gate-Entscheidung, Logging und Round-Report. Die drei Trigger-Bedingungen in `onRoundEnded` werden um `&& !this._suppressedByAdminOnline(...)` als **letzten** Term erweitert, sodass Short-Circuiting die Admin-Prüfung nur ausführt, wenn der Trigger sonst gefeuert hätte. Seed-Auto-Scramble und alle manuellen Pfade bleiben unberührt.

**Tech Stack:** Node.js 18 ESM, SquadJS 4.1.0 Plugin-API, kein Test-Framework (das Repo nutzt ein handgeschriebenes `assert()`-Harness in `testing/plugin-logic-test-runner.js`).

**Spec:** `docs/superpowers/specs/2026-07-30-admin-online-auto-scramble-gate-design.md`

## Global Constraints

- Zielversion SquadJS **4.1.0** (`/home/nkiewitt/projekte/SquadJS`, Commit `ee0b4d5`). Nur dort verifizierte APIs verwenden.
- Neue Option: `skipAutoScrambleWhenAdminOnline`, `type: 'boolean'`, `default: false`. Kein `required`.
- Plugin-Version am Ende: `3.2.1` → `3.3.0` (`plugins/team-balancer.js:212`).
- **Kein Permission-Filter** in der Admin-Erkennung — jeder Eintrag der Admin-Liste zählt, inklusive `reserve`/Whitelist. Bewusste Entscheidung, Spec §4.1.
- Beide ID-Formate prüfen: `server.admins` ist unter steamID **oder** eosID gekeyt (`squad-server/utils/admin-lists.js:72`).
- `Object.prototype.hasOwnProperty.call(...)` statt `in` — kein Treffer über die Prototypen-Kette.
- Fail-open: leere oder fehlende `server.admins` bedeutet „kein Admin online", niemals „alle sind Admin".
- Ungegated bleiben: Seed-Auto-Scramble (`:1374`), `!scramble matchend`-Arm (`:1258`), manuelle Scrambles (`:1095`, `utils/tb-commands.js:636`).
- Kein RCON-Warn an Admins (Spec §4.4) — Benachrichtigung nur nach Discord.
- Kommentare und Option-Descriptions im Code auf Englisch (Repo-Konvention). Nur die an Spieler/Admins gerichtete Discord-Nachricht ist deutsch.

---

## File Structure

| Datei | Verantwortung | Änderung |
|---|---|---|
| `package.json` | Dev-Harness-Modulkontext (`type: module`) + `sequelize` als devDependency | **Neu** (Task 0) |
| `testing/dev-loader.mjs` | ESM-`resolve`-Hook: leitet `./base-plugin.js` und `../../core/logger.js` auf die Stubs um, **nur** bei `ERR_MODULE_NOT_FOUND` | **Neu** (Task 0) |
| `testing/stubs/base-plugin.js` | Stub von SquadJS `base-plugin.js`, gleiche Option-Parsing-Semantik | **Neu** (Task 0) |
| `testing/stubs/logger.js` | Stub von SquadJS `core/logger.js`, standardmäßig still | **Neu** (Task 0) |
| `testing/run-logic-tests.mjs` | Entry-Wrapper: registriert den Loader, **dann** dynamischer Import des Runners | **Neu** (Task 0) |
| `testing/plugin-logic-test-runner.js` | Harness — `mockServer.admins`, Log-Capture, Phase 3.6 | Modify (Task 0, 1, 2) |
| `plugins/team-balancer.js` | Option, `_isAdminOnline()`, `_suppressedByAdminOnline()`, Gate-Stellen, mount-Warnung, Doku, Version | Modify (Task 1, 2, 4) |
| `utils/tb-commands.js` | Status-Zeile in `!teambalancer status` | Modify (Task 3) |
| `utils/tb-discord-helpers.js` | Status-Feld im Discord-Embed | Modify (Task 3) |
| `testing/README.md` | Run-Kommando für den Logic-Runner | Modify (Task 0) |
| `README.md` | Option dokumentieren | Modify (Task 4) |

**Warum Task 0 existiert:** `testing/plugin-logic-test-runner.js` ist aus diesem Repo **aktuell nicht ausführbar** — verifiziert am 2026-07-30: `node testing/plugin-logic-test-runner.js` scheitert mit `SyntaxError: Cannot use import statement outside a module`, weil das Repo keine `package.json` mit `"type": "module"` hat, und danach an `../../core/logger.js`, das nur innerhalb einer SquadJS-Installation existiert. Ohne Task 0 gibt es für Tasks 1–3 keinen Testzyklus. Das Muster ist aus dem Schwester-Repo `squadjs-elo-tracker` portiert (dort `testing/dev-loader.mjs` + `testing/stubs/`) und wurde in einer Wegwerf-Kopie verifiziert: **43/43 bestehende Assertions grün**.

---

## Task 0: Dev-Harness ausführbar machen

**Files:**
- Create: `package.json`
- Create: `testing/dev-loader.mjs`
- Create: `testing/stubs/base-plugin.js`
- Create: `testing/stubs/logger.js`
- Create: `testing/run-logic-tests.mjs`
- Modify: `testing/plugin-logic-test-runner.js:13-37` (Mock-Server: `admins` ergänzen)
- Modify: `testing/README.md:56-62` (Run-Kommando)

**Interfaces:**
- Consumes: nichts.
- Produces: Kommando `node testing/run-logic-tests.mjs` läuft das Harness aus dem Repo. `mockServer.admins` (Objekt, initial `{}`) steht Tasks 1 und 2 zur Verfügung.

`node_modules/` und `package-lock.json` sind in `.gitignore` bereits ausgeschlossen — keine Änderung nötig.

- [ ] **Step 1: `package.json` anlegen**

```json
{
  "name": "squadjs-team-balancer",
  "private": true,
  "type": "module",
  "description": "Dev harness for the SquadJS TeamBalancer plugin. In production the plugin runs inside SquadJS, which provides its own module context and dependencies.",
  "scripts": {
    "test:logic": "node testing/run-logic-tests.mjs",
    "test:scrambler": "node testing/scrambler-test-runner.js"
  },
  "devDependencies": {
    "sequelize": "^6.37.0"
  }
}
```

`sequelize` ist nötig, weil `utils/tb-database.js:56` es zur Ladezeit importiert. `sqlite3` wird **nicht** gebraucht — der Connector ist im Harness gemockt.

- [ ] **Step 2: `testing/stubs/logger.js` anlegen**

```javascript
/**
 * Dev-harness stub for SquadJS core/logger.js.
 * Used ONLY when the real SquadJS logger cannot be resolved (i.e. running the
 * test suite from this repo instead of inside a SquadJS deployment).
 * Silent by default; set TB_TEST_VERBOSE=1 to see log lines.
 */
class Logger {
  constructor() {
    this.verboseness = {};
  }

  verbose(module, verboseness, message, ...extras) {
    if (process.env.TB_TEST_VERBOSE) {
      console.log(`[${module}][${verboseness}] ${message}`, ...extras);
    }
  }

  setVerboseness(module, verboseness) {
    this.verboseness[module] = verboseness;
  }

  setColor() {}

  setTimeStamps() {}
}

export default new Logger();
```

- [ ] **Step 3: `testing/stubs/base-plugin.js` anlegen**

Semantisch identisch mit `SquadJS/squad-server/plugins/base-plugin.js` (4.1.0) — die Option-Defaults müssen sich im Test exakt wie in Produktion verhalten.

```javascript
/**
 * Dev-harness stub for SquadJS squad-server/plugins/base-plugin.js.
 * Used ONLY when the real BasePlugin cannot be resolved (i.e. running the
 * test suite from this repo instead of inside a SquadJS deployment).
 * Mirrors the real option-parsing semantics so optionsSpecification defaults
 * behave identically in tests.
 */
import Logger from './logger.js';

export default class BasePlugin {
  constructor(server, options, connectors) {
    this.server = server;
    this.options = {};
    this.rawOptions = options;

    for (const [optionName, option] of Object.entries(this.constructor.optionsSpecification)) {
      if (option.connector) {
        this.options[optionName] = connectors[this.rawOptions[optionName]];
      } else {
        if (option.required) {
          if (!(optionName in this.rawOptions))
            throw new Error(`${this.constructor.name}: ${optionName} is required but missing.`);
          if (option.default === this.rawOptions[optionName])
            throw new Error(
              `${this.constructor.name}: ${optionName} is required but is the default value.`
            );
        }

        this.options[optionName] =
          typeof this.rawOptions[optionName] !== 'undefined'
            ? this.rawOptions[optionName]
            : option.default;
      }
    }
  }

  async prepareToMount() {}

  async mount() {}

  async unmount() {}

  static get description() {
    throw new Error('Plugin missing "static get description()" method.');
  }

  static get defaultEnabled() {
    throw new Error('Plugin missing "static get defaultEnabled()" method.');
  }

  static get optionsSpecification() {
    throw new Error('Plugin missing "static get optionSpecification()" method.');
  }

  verbose(...args) {
    Logger.verbose(this.constructor.name, ...args);
  }
}
```

- [ ] **Step 4: `testing/dev-loader.mjs` anlegen**

```javascript
/**
 * ESM resolve hook for the dev test harness.
 *
 * The production modules import SquadJS core files by relative path
 * ('./base-plugin.js', '../../core/logger.js') that only exist inside a
 * SquadJS deployment. When running the test suite from this repo those
 * imports fail to resolve; this hook falls back to the stubs in
 * testing/stubs/ — ONLY on resolution failure, so inside a real deployment
 * the genuine SquadJS modules always win.
 */
const STUBS = [
  { suffix: 'base-plugin.js', stub: new URL('./stubs/base-plugin.js', import.meta.url).href },
  { suffix: 'core/logger.js', stub: new URL('./stubs/logger.js', import.meta.url).href }
];

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err && err.code === 'ERR_MODULE_NOT_FOUND') {
      for (const { suffix, stub } of STUBS) {
        if (specifier.endsWith(suffix) && !specifier.includes('/stubs/')) {
          return nextResolve(stub, context);
        }
      }
    }
    throw err;
  }
}
```

- [ ] **Step 5: `testing/run-logic-tests.mjs` anlegen**

Der Wrapper ist **zwingend eine eigene Datei**: statische `import`-Statements werden vor jedem Code im selben Modul aufgelöst, ein `register()` am Anfang des Runners käme also zu spät. Verifiziert — mit `register()` im Runner selbst schlägt die Auflösung von `../../core/logger.js` weiterhin fehl.

```javascript
/**
 * Entry point for the plugin logic test harness when run from this repo.
 *
 * register() must run BEFORE the runner's static imports are resolved, which
 * is why this wrapper exists as a separate module and imports the runner
 * dynamically. Inside a SquadJS deployment the runner can be executed
 * directly — the hook is a no-op there because the real modules resolve.
 */
import { register } from 'node:module';

register('./dev-loader.mjs', import.meta.url);

await import('./plugin-logic-test-runner.js');
```

- [ ] **Step 6: `mockServer.admins` ergänzen**

In `testing/plugin-logic-test-runner.js`, im `mockServer`-Objekt nach `squads: []` (Zeile 29):

```javascript
  players: [], // empty for logic tests
  squads: [], // empty for logic tests
  admins: {}, // SquadJS admin list: { [steamID|eosID]: { permission: true } }
  currentLayer: null,
```

- [ ] **Step 7: Abhängigkeit installieren und Baseline laufen lassen**

Run:
```bash
cd /home/nkiewitt/projekte/squadjs-team-balancer && npm install
node testing/run-logic-tests.mjs
```
Expected: `🏁 All logic tests completed. Result: 43/43 passed.`

Der Lauf dauert ~30 s, weil ausstehende Scramble-Countdowns (10 s Timeout) auslaufen; danach folgen noch `[Attribution]`-Logzeilen aus feuernden Countdowns. Das ist bestehendes Verhalten, kein Fehler. Die Zeile `Result: 43/43 passed.` ist das Kriterium.

- [ ] **Step 8: `testing/README.md` aktualisieren**

Den Abschnitt zu `plugin-logic-test-runner.js` (Zeile 56-62) so ersetzen:

````markdown
### `plugin-logic-test-runner.js`

Tests win streak logic, dominant win detection, and scramble triggering using a mock SquadJS environment. Does not require a live server, but the mock server harness may drift from the real SquadJS API over time.

Run it through the wrapper — it registers `dev-loader.mjs`, which redirects the plugin's SquadJS-core imports (`./base-plugin.js`, `../../core/logger.js`) to `testing/stubs/` when the real files are absent. Requires `npm install` once.

```bash
npm install
node testing/run-logic-tests.mjs
```

Inside a real SquadJS deployment the runner also works directly (`node plugin-logic-test-runner.js` from `squad-server/testing/`) — the stub fallback only fires when the genuine modules cannot be resolved.
````

- [ ] **Step 9: Commit**

```bash
git add package.json testing/dev-loader.mjs testing/stubs testing/run-logic-tests.mjs testing/plugin-logic-test-runner.js testing/README.md
git commit -m "test: make the plugin logic harness runnable from this repo

Ports the dev-loader + stubs pattern from squadjs-elo-tracker so the logic
runner no longer requires a SquadJS deployment. Adds mockServer.admins for
upcoming admin-gate tests."
```

---

## Task 1: Option und Admin-Erkennung

**Files:**
- Modify: `plugins/team-balancer.js` — `optionsSpecification` (nach `enableSeedAutoScramble`, Zeile 239-243), neue Methode nach `isSeedMatch()` (Zeile 536), Warnung in `mount()` (nach Zeile 544)
- Modify: `testing/plugin-logic-test-runner.js` — neue Phase 3.6 nach Zeile 392

**Interfaces:**
- Consumes: `mockServer.admins` aus Task 0.
- Produces: `this.options.skipAutoScrambleWhenAdminOnline` (boolean) und `_isAdminOnline(): boolean` — beide werden von Task 2 und Task 3 verwendet.

- [ ] **Step 1: Die Assertions schreiben**

In `testing/plugin-logic-test-runner.js` **nach** Zeile 392 (`delete mockServer.matchStartTime;`) und **vor** `// --- Final Report ---` einfügen:

```javascript
  // --- Phase 3.6: skipAutoScrambleWhenAdminOnline (admin-online gate) ---
  console.log('\n[Phase 3.6: Admin-Online Gate]');

  // Fixtures. SquadJS keys server.admins by whatever ID the admin list holds — a 17-digit
  // steamID or a 32-hex eosID (squad-server/utils/admin-lists.js:72) — so both are covered.
  const adminBySteamID = { eosID: 'eos_admin_steam', steamID: '76561198000000001', name: 'AdminSteam', teamID: 1, squadID: null, roles: ['Rifleman'] };
  const adminByEosID = { eosID: 'a1b2c3d4e5f60718293a4b5c6d7e8f90', steamID: '76561198000000002', name: 'AdminEos', teamID: 1, squadID: null, roles: ['Rifleman'] };
  const plainPlayer = { eosID: 'eos_plain', steamID: '76561198000000003', name: 'Plain', teamID: 2, squadID: null, roles: ['Rifleman'] };
  const savedPlayers = mockServer.players;

  // _isAdminOnline(): steamID-keyed admin list.
  mockServer.players = [adminBySteamID, plainPlayer];
  mockServer.admins = { '76561198000000001': { canseeadminchat: true } };
  assert(tb._isAdminOnline() === true, 'gate: _isAdminOnline() matches an admin via steamID key.');

  // eosID-keyed admin list — a steamID-only check would miss this entirely.
  mockServer.players = [adminByEosID, plainPlayer];
  mockServer.admins = { a1b2c3d4e5f60718293a4b5c6d7e8f90: { canseeadminchat: true } };
  assert(tb._isAdminOnline() === true, 'gate: _isAdminOnline() matches an admin via eosID key.');

  // Listed admin is not connected.
  mockServer.players = [plainPlayer];
  mockServer.admins = { '76561198000000001': { canseeadminchat: true } };
  assert(tb._isAdminOnline() === false, 'gate: _isAdminOnline() is false when no listed admin is connected.');

  // Unconfigured adminLists yields {} — must read as "no admin online", never as "everyone".
  mockServer.players = [adminBySteamID, plainPlayer];
  mockServer.admins = {};
  assert(tb._isAdminOnline() === false, 'gate: an empty admin list means no admin online (fail-open).');

  // A missing server.admins must not throw.
  delete mockServer.admins;
  assert(tb._isAdminOnline() === false, 'gate: a missing server.admins is handled without throwing.');
  mockServer.admins = {};

  // An EGS-only account has no steamID — it must not match a literal "undefined" key.
  mockServer.players = [{ eosID: 'eos_no_steam', name: 'NoSteam', teamID: 1, squadID: null, roles: ['Rifleman'] }];
  mockServer.admins = { undefined: { canseeadminchat: true } };
  assert(tb._isAdminOnline() === false, 'gate: a player without a steamID does not match an "undefined" admin key.');

  // Prototype keys must not count as admins (regression guard for hasOwnProperty vs `in`).
  mockServer.players = [{ eosID: 'eos_proto', steamID: 'constructor', name: 'Proto', teamID: 1, squadID: null, roles: ['Rifleman'] }];
  mockServer.admins = {};
  assert(tb._isAdminOnline() === false, 'gate: prototype keys (e.g. "constructor") do not count as admins.');

  mockServer.players = savedPlayers;
  mockServer.admins = {};
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `node testing/run-logic-tests.mjs`
Expected: Abbruch mit `TypeError: tb._isAdminOnline is not a function`. Die Zeile `[Phase 3.6: Admin-Online Gate]` erscheint noch, die `🏁 All logic tests completed`-Zeile **nicht**.

- [ ] **Step 3: Option ergänzen**

In `plugins/team-balancer.js`, in `optionsSpecification` direkt nach dem `enableSeedAutoScramble`-Block (endet Zeile 243):

```javascript
      skipAutoScrambleWhenAdminOnline: {
        default: false,
        type: 'boolean',
        description: 'Suppress the automatic streak/margin scramble triggers while at least one player from the SquadJS admin list is connected — the idea being that a present admin decides for themselves via !scramble. All trigger conditions and streak counters stay unchanged; only the firing is skipped. Seed auto-scramble and manual scrambles are unaffected. Requires the server "adminLists" config to be populated, otherwise the gate can never engage.'
      },
```

- [ ] **Step 4: `_isAdminOnline()` implementieren**

In `plugins/team-balancer.js` nach dem Ende von `isSeedMatch()` (Zeile 536) und vor `async mount()` (Zeile 537):

```javascript

  // True if any connected player appears in the SquadJS admin list. Mirrors the check used by the
  // Switch plugin (server.admins keyed by whatever ID the admin list holds), extended to also match
  // eosID-keyed lists — SquadJS accepts both (admin-lists.js matches /\d{17}|[a-f0-9]{32}/), so a
  // steamID-only check misses an EOS-based Admins.cfg entirely. hasOwnProperty (not `in`) so no
  // prototype key can read as an admin. No permission filter by design: every admin-list entry
  // counts, including reserve/whitelist groups.
  // ponytail: reads the 30s-polled server.players — an admin who left <30s ago still blocks. The
  // error self-corrects at the next round end; call updatePlayerList() here if that ever matters.
  _isAdminOnline() {
    const admins = this.server.admins;
    if (!admins) return false;
    const isAdminID = (id) => id != null && Object.prototype.hasOwnProperty.call(admins, id);
    return (this.server.players || []).some((p) => isAdminID(p.steamID) || isAdminID(p.eosID));
  }
```

- [ ] **Step 5: Warnung bei leerer Admin-Liste in `mount()`**

In `plugins/team-balancer.js` direkt nach `this.validateOptions();` (Zeile 544) und vor dem `devMode`-Block (Zeile 546):

```javascript

    // Without a populated adminLists, server.admins stays {} and the gate can never engage — turn
    // that silent no-op into a visible misconfiguration. server.admins is already loaded here:
    // SquadJS awaits watch() (which fetches the admin lists) before mounting plugins.
    if (this.options.skipAutoScrambleWhenAdminOnline && Object.keys(this.server.admins || {}).length === 0) {
      Logger.verbose('TeamBalancer', 1, '⚠️ skipAutoScrambleWhenAdminOnline is enabled but SquadJS loaded 0 admins — check the server "adminLists" config. The gate can never engage and auto-scramble behaves as if the option were off.');
    }
```

- [ ] **Step 6: Test laufen lassen, Erfolg bestätigen**

Run: `node testing/run-logic-tests.mjs`
Expected: `🏁 All logic tests completed. Result: 50/50 passed.` (43 bestehende + 7 neue)

- [ ] **Step 7: Commit**

```bash
git add plugins/team-balancer.js testing/plugin-logic-test-runner.js
git commit -m "feat: add skipAutoScrambleWhenAdminOnline option and admin detection

_isAdminOnline() checks connected players against server.admins by both
steamID and eosID, since SquadJS keys the admin list by either. No
permission filter by design. Warns at mount when the option is on but the
admin list is empty, so an unconfigured adminLists is not a silent no-op."
```

---

## Task 2: Das Gate in `onRoundEnded`

**Files:**
- Modify: `plugins/team-balancer.js` — neue Methode nach `_isAdminOnline()`; Trigger-Bedingungen Zeile 1426, 1450, 1605, 1642
- Modify: `testing/plugin-logic-test-runner.js` — Log-Capture (Zeile 5-7), `seedScrambleAnnouncement` im RconMessages-Mock (Zeile 147), Assertions am Ende von Phase 3.6

**Interfaces:**
- Consumes: `_isAdminOnline(): boolean` und `this.options.skipAutoScrambleWhenAdminOnline` aus Task 1.
- Produces: `_suppressedByAdminOnline(condition: string, roundReport: object): boolean` — `true` heißt „Trigger muss stillhalten". Setzt als Nebeneffekt `roundReport.scrambleCondition` und schickt die Discord-Meldung.

- [ ] **Step 1: Harness für die Assertions vorbereiten**

(a) In `testing/plugin-logic-test-runner.js` den Logger-Override (Zeile 5-7) ersetzen, damit die Round-Report-Zeile (im Plugin auf Level 1 geloggt, `team-balancer.js:1737`) auswertbar wird:

```javascript
// Suppress logger output for cleaner test results, but keep level-1 lines for assertions
// (the round report is logged at level 1 and is how we verify scrambleCondition).
const capturedLogs = [];
Logger.verbose = (module, level, message) => {
  if (level === 1) {
    capturedLogs.push(String(message));
    console.error(`[${module}] ERROR: ${message}`);
  }
};
```

(b) Im `tb.RconMessages`-Mock nach `matchEndScrambleAnnouncement` (Zeile 147) ergänzen, damit der Seed-Broadcast im Test prüfbaren Text hat:

```javascript
    seedScrambleAnnouncement: 'Seed scramble in {delay}s',
```

- [ ] **Step 2: Die Assertions schreiben**

Am Ende von Phase 3.6 einfügen — **nach** der Zeile `mockServer.admins = {};` aus Task 1 Step 1 und vor `// --- Final Report ---`:

```javascript

  // --- Gate behaviour ---
  const adminOnline = () => {
    mockServer.players = [adminBySteamID, plainPlayer];
    mockServer.admins = { '76561198000000001': { canseeadminchat: true } };
  };
  const noAdminOnline = () => {
    mockServer.players = [plainPlayer];
    mockServer.admins = { '76561198000000001': { canseeadminchat: true } };
  };

  tb.manuallyDisabled = false;
  tb.options.enableWinStreakTracking = true;
  tb.options.maxWinStreak = 1;
  tb.gameModeCached = 'RAAS';

  // Regression: with the option off, an online admin changes nothing.
  tb.options.skipAutoScrambleWhenAdminOnline = false;
  adminOnline();
  await tb.resetStreak();
  tb._scramblePending = false;
  await tb.onRoundEnded({ winner: { team: 1, tickets: 400 }, loser: { tickets: 0 } });
  assert(tb._scramblePending === true, 'gate: with the option off, an online admin does not block the scramble.');
  await tb.cancelPendingScramble(null, null, true);

  // Option on, no admin online: unchanged behaviour.
  tb.options.skipAutoScrambleWhenAdminOnline = true;
  noAdminOnline();
  await tb.resetStreak();
  tb._scramblePending = false;
  await tb.onRoundEnded({ winner: { team: 1, tickets: 400 }, loser: { tickets: 0 } });
  assert(tb._scramblePending === true, 'gate: with the option on and no admin online, the scramble still fires.');
  await tb.cancelPendingScramble(null, null, true);

  // Option on, admin online: suppressed, streak preserved, normal win message instead.
  // Margin 400 is dominant (threshold 300) but below the stomp cutoff (450), so the
  // expected broadcast template is 'Steamrolled'.
  adminOnline();
  await tb.resetStreak();
  tb._scramblePending = false;
  capturedBroadcasts.length = 0;
  capturedLogs.length = 0;
  await tb.onRoundEnded({ winner: { team: 1, tickets: 400 }, loser: { tickets: 0 } });
  assert(tb._scramblePending === false, 'gate: an online admin suppresses the win-streak scramble.');
  assert(tb.winStreakCount === 1, 'gate: the win streak keeps counting while suppressed.');
  assert(!capturedBroadcasts.find((m) => m.includes('Scramble in')), 'gate: no scramble announcement is broadcast when suppressed.');
  assert(!!capturedBroadcasts.find((m) => m.includes('Steamrolled')), 'gate: the normal dominant-win message is broadcast instead.');
  assert(!!capturedLogs.find((m) => m.includes('Condition: Suppressed (Admin Online): Win Streak Threshold')), 'gate: the round report records the suppressed trigger.');

  // Once the admin leaves, the preserved streak fires at the next round end.
  noAdminOnline();
  tb._scramblePending = false;
  await tb.onRoundEnded({ winner: { team: 1, tickets: 400 }, loser: { tickets: 0 } });
  assert(tb._scramblePending === true, 'gate: once the admin leaves, the preserved streak triggers the scramble.');
  await tb.cancelPendingScramble(null, null, true);

  // Consecutive-wins trigger is gated too. maxWinStreak is parked high so only this path can fire.
  tb.options.maxWinStreak = 99;
  tb.options.maxConsecutiveWinsWithoutThreshold = 2;
  adminOnline();
  await tb.resetStreak();
  tb._scramblePending = false;
  await tb.onRoundEnded({ winner: { team: 1, tickets: 50 }, loser: { tickets: 0 } });
  await tb.onRoundEnded({ winner: { team: 1, tickets: 50 }, loser: { tickets: 0 } });
  assert(tb.consecutiveWinsCount === 2, 'gate: consecutive wins keep counting while suppressed.');
  assert(tb._scramblePending === false, 'gate: an online admin suppresses the consecutive-wins scramble.');
  noAdminOnline();
  await tb.onRoundEnded({ winner: { team: 1, tickets: 50 }, loser: { tickets: 0 } });
  assert(tb._scramblePending === true, 'gate: the consecutive-wins scramble fires once no admin is online.');
  await tb.cancelPendingScramble(null, null, true);
  tb.options.maxConsecutiveWinsWithoutThreshold = 0;

  // Single-round-margin trigger is gated too, and falls through to the dominance path
  // (documented behaviour change: the suppressed round now counts toward the win streak).
  tb.options.enableSingleRoundScramble = true;
  tb.options.singleRoundScrambleThreshold = 500;
  adminOnline();
  await tb.resetStreak();
  tb._scramblePending = false;
  await tb.onRoundEnded({ winner: { team: 1, tickets: 600 }, loser: { tickets: 99 } }); // margin 501
  assert(tb._scramblePending === false, 'gate: an online admin suppresses the single-round-margin scramble.');
  assert(tb.winStreakCount === 1, 'gate: a suppressed single-round trigger falls through and the streak counts the dominant win.');
  tb.options.enableSingleRoundScramble = false;
  tb.options.maxWinStreak = 1;

  // The seed auto-scramble is exempt from the gate.
  tb.options.enableSeedAutoScramble = true;
  tb.gameModeCached = 'Seed';
  tb.layerNameCached = 'Logar_Seed_v1';
  adminOnline();
  await tb.resetStreak();
  tb._scramblePending = false;
  capturedBroadcasts.length = 0;
  await tb.onRoundEnded({ winner: { team: 1, tickets: 400 }, loser: { tickets: 0 } });
  assert(tb._scramblePending === true, 'gate: the seed auto-scramble is exempt and still fires with an admin online.');
  assert(!!capturedBroadcasts.find((m) => m.includes('Seed scramble in')), 'gate: the seed announcement is still broadcast with an admin online.');
  await tb.cancelPendingScramble(null, null, true);
  tb.gameModeCached = 'RAAS';
  tb.layerNameCached = null;

  // Manual scrambles are never gated.
  adminOnline();
  tb.options.requireScrambleConfirmation = false;
  tb._scramblePending = false;
  await tb.onScrambleCommand({ message: '', chat: 'ChatAdmin', steamID: 'admin1', player: { name: 'Admin', steamID: 'admin1' } });
  assert(tb._scramblePending === true, 'gate: a manual !scramble is not gated by an online admin.');
  await tb.cancelPendingScramble(null, null, true);
  tb.options.requireScrambleConfirmation = true;

  // An unconfigured admin list must not silently disable auto-scramble.
  mockServer.players = [adminBySteamID, plainPlayer];
  mockServer.admins = {};
  await tb.resetStreak();
  tb._scramblePending = false;
  await tb.onRoundEnded({ winner: { team: 1, tickets: 400 }, loser: { tickets: 0 } });
  assert(tb._scramblePending === true, 'gate: an empty admin list leaves auto-scramble working (fail-open).');
  await tb.cancelPendingScramble(null, null, true);

  // Restore harness state for anything appended after this phase.
  tb.options.skipAutoScrambleWhenAdminOnline = false;
  mockServer.players = savedPlayers;
  mockServer.admins = {};
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag bestätigen**

Run: `node testing/run-logic-tests.mjs`
Expected: Der Lauf kommt bis `🏁 All logic tests completed.` durch, aber mit Fehlschlägen — mindestens diese Zeilen:
```
  ❌ FAIL: gate: an online admin suppresses the win-streak scramble.
  ❌ FAIL: gate: the round report records the suppressed trigger.
  ❌ FAIL: gate: an online admin suppresses the consecutive-wins scramble.
  ❌ FAIL: gate: an online admin suppresses the single-round-margin scramble.
```
und `⚠️ Some logic tests failed.` am Ende. Wichtig: `gate: the seed auto-scramble is exempt …` und die drei „fires"-Assertions müssen bereits **PASS** sein — sie beschreiben unverändertes Verhalten.

- [ ] **Step 4: `_suppressedByAdminOnline()` implementieren**

In `plugins/team-balancer.js` direkt nach `_isAdminOnline()` (aus Task 1 Step 4):

```javascript

  // True when an auto-scramble trigger must stand down because an admin is online. Call it as the
  // LAST condition of a trigger check: short-circuiting then means it only runs when the trigger
  // would otherwise have fired, so the round report records what was actually suppressed rather
  // than every round the option happens to be on.
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

- [ ] **Step 5: Consecutive-Wins-Trigger gaten**

`plugins/team-balancer.js:1426` — die Bedingung erweitern:

```javascript
      if (this.options.maxConsecutiveWinsWithoutThreshold > 0 && this.consecutiveWinsCount >= this.options.maxConsecutiveWinsWithoutThreshold && !this._suppressedByAdminOnline('Consecutive Wins', roundReport)) {
```

- [ ] **Step 6: Single-Round-Margin-Trigger gaten**

`plugins/team-balancer.js:1450` — die Bedingung erweitern:

```javascript
      if (this.options.enableSingleRoundScramble && !isInvasion && margin >= this.options.singleRoundScrambleThreshold && !this._suppressedByAdminOnline('Single Round Margin', roundReport)) {
```

- [ ] **Step 7: Win-Streak-Trigger gaten**

`plugins/team-balancer.js:1605` ersetzen:

```javascript
      const scrambleComing = this.winStreakCount >= this.options.maxWinStreak && !this._suppressedByAdminOnline('Win Streak Threshold', roundReport);
```

`plugins/team-balancer.js:1642` ersetzen:

```javascript
      if (scrambleComing) {
```

Zwischen 1605 und 1642 wird `winStreakCount` nicht mehr verändert (nur Broadcasts), die Umstellung ist also verhaltensgleich — und stellt sicher, dass `_suppressedByAdminOnline` für diesen Trigger genau einmal läuft. Nebeneffekt, der so gewollt ist: bei Unterdrückung wird `scrambleComing` false, wodurch Zeile 1608 die normale Dominant-Win-Meldung broadcastet statt der Scramble-Ankündigung.

- [ ] **Step 8: Test laufen lassen, Erfolg bestätigen**

Run: `node testing/run-logic-tests.mjs`
Expected: `🏁 All logic tests completed. Result: 66/66 passed.` (50 aus Task 1 + 16 neue)

- [ ] **Step 9: Commit**

```bash
git add plugins/team-balancer.js testing/plugin-logic-test-runner.js
git commit -m "feat: gate the streak/margin auto-scramble triggers on admin presence

Consecutive Wins, Single Round Margin and Win Streak Threshold now stand
down while an admin is online. Streak counters keep advancing, so the
scramble fires at the next round end once no admin is connected. Seed
auto-scramble and manual scrambles stay ungated."
```

---

## Task 3: Status-Anzeige

**Files:**
- Modify: `utils/tb-commands.js` — vor `const statusMsg = [` (Zeile 343) und im Array
- Modify: `utils/tb-discord-helpers.js` — in `buildStatusEmbed()`, vor `const embed = {` (Zeile 81) und in `fields`

**Interfaces:**
- Consumes: `tb._isAdminOnline(): boolean`, `tb.options.skipAutoScrambleWhenAdminOnline`, `tb.server.admins` aus Task 1.
- Produces: nichts, was spätere Tasks konsumieren.

Ohne diese Anzeige kann ein Admin im Spiel nicht erkennen, warum kein Scramble kam. Der dritte Zustand macht die Fehlkonfiguration aus Task 1 Step 5 auch in-game sichtbar.

- [ ] **Step 1: In-Game-Status ergänzen**

In `utils/tb-commands.js` direkt vor `const statusMsg = [` (Zeile 343) einfügen:

```javascript
            // Admin-online gate: without this an admin in-game cannot tell why no scramble happened.
            const adminGateText = !this.options.skipAutoScrambleWhenAdminOnline
              ? null
              : Object.keys(this.server.admins || {}).length === 0
              ? 'ADMIN LIST EMPTY (check adminLists config)'
              : this._isAdminOnline()
              ? 'ACTIVE (admin online — auto-scramble held)'
              : 'ARMED (no admin online)';

```

Im `statusMsg`-Array die Zeile nach `Consecutive Wins:` und vor `Last Scramble:` einfügen:

```javascript
              `Consecutive Wins: ${consecText}`,
              ...(adminGateText ? [`Admin Gate: ${adminGateText}`] : []),
              `Last Scramble: ${lastScrambleText}`,
```

- [ ] **Step 2: Discord-Embed ergänzen**

In `utils/tb-discord-helpers.js` in `buildStatusEmbed()` direkt vor `const embed = {` (Zeile 81) einfügen:

```javascript
    const adminGateText = !tb.options?.skipAutoScrambleWhenAdminOnline
      ? null
      : Object.keys(tb.server.admins || {}).length === 0
      ? '⚠️ Admin list empty'
      : tb._isAdminOnline()
      ? '🛑 Admin online (held)'
      : '✅ Armed (no admin)';

```

Im `fields`-Array nach dem `Round-End Scramble`-Feld (Zeile 90) einfügen:

```javascript
        ...(adminGateText ? [{ name: 'Admin Gate', value: adminGateText, inline: true }] : []),
```

- [ ] **Step 3: Status-Ausgabe verifizieren**

Am Ende von Phase 3.6 in `testing/plugin-logic-test-runner.js`, **vor** dem `// Restore harness state`-Block aus Task 2 Step 2:

```javascript

  // Status output reflects all three gate states.
  tb.options.skipAutoScrambleWhenAdminOnline = true;
  adminOnline();
  let statusReply = await tb.onChatCommand({ message: 'status', chat: 'ChatAdmin', steamID: 'admin1', player: { name: 'Admin', steamID: 'admin1' } });
  assert(/Admin Gate: ACTIVE/.test(statusReply || ''), 'status: the gate shows ACTIVE while an admin is online.');
  noAdminOnline();
  statusReply = await tb.onChatCommand({ message: 'status', chat: 'ChatAdmin', steamID: 'admin1', player: { name: 'Admin', steamID: 'admin1' } });
  assert(/Admin Gate: ARMED/.test(statusReply || ''), 'status: the gate shows ARMED when no admin is online.');
  mockServer.admins = {};
  statusReply = await tb.onChatCommand({ message: 'status', chat: 'ChatAdmin', steamID: 'admin1', player: { name: 'Admin', steamID: 'admin1' } });
  assert(/Admin Gate: ADMIN LIST EMPTY/.test(statusReply || ''), 'status: an empty admin list is surfaced in the status output.');
  tb.options.skipAutoScrambleWhenAdminOnline = false;
  statusReply = await tb.onChatCommand({ message: 'status', chat: 'ChatAdmin', steamID: 'admin1', player: { name: 'Admin', steamID: 'admin1' } });
  assert(!/Admin Gate/.test(statusReply || ''), 'status: the gate line is omitted when the option is off.');
```

Der Block setzt `adminOnline()` / `noAdminOnline()` aus Task 2 Step 2 voraus, muss also nach diesen Definitionen stehen.

`statusReply` ist zuverlässig ein String: `tb.respond()` gibt `msg` zurück (`utils/tb-commands.js:72`) und der `status`-Case gibt dessen Rückgabewert weiter. `getTeamName()` kann nicht werfen — mit `useGenericTeamNamesInBroadcasts: true` in den Testoptionen liefert es `Team ${teamID}` (`plugins/team-balancer.js:804`).

Run: `node testing/run-logic-tests.mjs`
Expected: `🏁 All logic tests completed. Result: 70/70 passed.`

- [ ] **Step 4: Commit**

```bash
git add utils/tb-commands.js utils/tb-discord-helpers.js testing/plugin-logic-test-runner.js
git commit -m "feat: show the admin gate state in !teambalancer status and Discord

Three states: ACTIVE (held), ARMED (no admin), ADMIN LIST EMPTY. The line
is omitted entirely when the option is off."
```

---

## Task 4: Dokumentation und Version

**Files:**
- Modify: `plugins/team-balancer.js:212` (Version), `:51-59` (NOTES), `:88` (CONFIGURATION), `:156` (Beispiel-JSON)
- Modify: `README.md:142` (Beispiel-JSON), `:237` (Options-Liste)

**Interfaces:**
- Consumes: die fertige Option aus Tasks 1-3.
- Produces: nichts.

- [ ] **Step 1: Version anheben**

`plugins/team-balancer.js:212`:

```javascript
  static version = '3.3.0';
```

- [ ] **Step 2: NOTES-Block ergänzen**

`plugins/team-balancer.js` — nach der `enableSeedAutoScramble`-Notiz (Zeile 51-52) einfügen:

```
 * - skipAutoScrambleWhenAdminOnline: suppresses the streak/margin auto-scramble
 *   triggers while any player from the SquadJS admin list is connected. Streak
 *   counters keep advancing, so the scramble fires at the next round end once no
 *   admin is online. Seed auto-scramble and manual scrambles are NOT gated.
 *   No permission filter — reserve/whitelist entries count as admins too.
 *   Requires the server "adminLists" config to be populated; with an empty admin
 *   list the gate can never engage (a warning is logged at mount).
```

- [ ] **Step 3: CONFIGURATION-Liste ergänzen**

`plugins/team-balancer.js` — unter "Core:" nach Zeile 88 (`enableSeedAutoScramble`):

```
 *   skipAutoScrambleWhenAdminOnline    - Hold the streak/margin auto-scramble while an admin is online (default: false).
```

- [ ] **Step 4: Beispiel-JSON im Header ergänzen**

`plugins/team-balancer.js` — nach Zeile 156 (`"enableSeedAutoScramble": true,`):

```
 *   "skipAutoScrambleWhenAdminOnline": false,
```

- [ ] **Step 5: README ergänzen**

`README.md` — nach Zeile 142 (`"enableSeedAutoScramble": true,`):

```
  "skipAutoScrambleWhenAdminOnline": false,
```

`README.md` — nach Zeile 237 in "Core Settings":

```
skipAutoScrambleWhenAdminOnline     - Hold the streak/margin auto-scramble while any player from the SquadJS admin list is online; they decide via !scramble instead (default: false). Streak counters keep advancing, so a held scramble fires at the next round end once no admin is connected. Seed auto-scramble and manual scrambles are not affected. Counts every admin-list entry including reserve/whitelist groups, and requires the server "adminLists" config to be populated.
```

- [ ] **Step 6: Regressionslauf**

Run: `node testing/run-logic-tests.mjs`
Expected: `🏁 All logic tests completed. Result: 70/70 passed.`

- [ ] **Step 7: Commit**

```bash
git add plugins/team-balancer.js README.md
git commit -m "docs: document skipAutoScrambleWhenAdminOnline, bump to 3.3.0"
```

---

## Manuelle Verifikation am Live-Server

Vom Harness nicht abgedeckt, weil dafür eine echte Admin-Liste und RCON nötig sind:

1. `skipAutoScrambleWhenAdminOnline: true` setzen, SquadJS neu starten, Log auf `admins loaded` prüfen — steht dort `0 admins loaded`, greift das Gate nie und die Warnung aus Task 1 Step 5 muss erscheinen.
2. Mit einem Admin-Account joinen, `!teambalancer status` → `Admin Gate: ACTIVE`.
3. Admin verlässt den Server, ~30 s warten (Poll-Intervall), `!teambalancer status` → `Admin Gate: ARMED`.
4. Eine Runde mit erfülltem Win-Streak-Trigger bei anwesendem Admin: kein Scramble, normale Win-Meldung im Spiel, Discord-Report mit „Auto-Scramble unterdrückt".

Die mount-Warnung wird bewusst **nicht** automatisiert getestet: dafür bräuchte es eine zweite `mount()`-Ausführung im Harness, die die Polling-Timer erneut startet und den Testprozess offen hält. Das Verhalten, das tatsächlich regressieren kann — Fail-open bei leerer Admin-Liste — ist durch zwei Assertions abgedeckt (Task 1 Step 1 und Task 2 Step 2).
