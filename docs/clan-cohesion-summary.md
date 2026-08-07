# Clan-Kohäsion garantieren, `divided!` entfernen

**Basis:** `a77c64d` (Branch `legacy`) · **Stand:** 2026-08-07 · **Diff:** [`clan-cohesion-diff.md`](./clan-cohesion-diff.md)

## Warum

Commit `fd0fa28` („Refactor to squad-preserving single-phase swaps") hat die Eskalationsphasen 2–4 entfernt, die ein Squad zerlegen konnten. Die Suche wählt seitdem nur ganze Atome — ein Virtual Squad ist eines. Der `divided!`-Zweig im Discord-Report samt `moved`/`stay`-Spalte hatte damit seinen Zweck verloren.

Er war aber nicht tot, sondern **falsch**. Zwei Ursachen, beide behoben:

### Ursache 1 — Roster-Snapshot wurde nicht nachgeführt

`tb-scrambler.js` fror die Zusammensetzung einer Clan-Gruppe (`allMembers`) in dem Moment ein, in dem sie gebaut wurde. Ein *später* verarbeiteter Clan konnte danach seine eigenen Mitglieder wieder aus dieser Gruppe herausziehen — der Snapshot bekam das nie mit.

Folge: Der Report-Roster war ein Superset des Atoms, das tatsächlich bewegt wurde. `divided!` feuerte, obwohl der Clan vollständig zusammengeblieben war. Weil `extractClanGroups` disjunkte Gruppen liefert, betraf das immer nur mitgezogene Nicht-Clan-Spieler, nie echte Mitglieder.

Gemessen im Szenario `generateScenario_ClanSquadCollision` (zwei Clans teilen sich ein Squad), 300 Läufe pro Modus:

| Szenario | vorher | nachher |
|---|---|---|
| Zwei Clans teilen ein Squad (`pullEntireSquads: false`) | **200 / 600** Roster verletzt | 0 / 600 |
| Zwei Clans teilen ein Squad (`pullEntireSquads: true`) | **273 / 600** Roster verletzt | 0 / 600 |
| Clan über mehrere Squads | 0 / 900 | 0 / 900 |
| Ähnlichkeits-Merging | 0 / 1500 | 0 / 1500 |

Das sind 57 % aller *sichtbar gerenderten* Blöcke im Collision-Szenario. Ein realer Fall aus dem Messlauf: `[AAA] 3/13 bewegt` — der Block wurde angezeigt, obwohl `[AAA]` sich überhaupt nicht bewegt hatte; die drei „Mover" waren abgeworbene Spieler eines fremden Clans.

### Ursache 2 — unassigned Clan-Mitglieder galten als lose

Ein Spieler ohne Squad, der über sein Clan-Tag in ein Virtual Squad gefaltet wurde, behielt intern `squadID === null`. Der Cap-Enforcement-Trim filtert genau darauf, hielt ihn für frei verfügbar und konnte ihn einzeln auf das andere Team schieben — der einzige verbliebene Weg, auf dem ein Clan wirklich zerrissen wurde.

## Was geändert wurde

### `utils/tb-scrambler.js`

1. **Squad-Identität statt Sonderfall.** Wer per Clan-Tag ins Virtual Squad gefaltet wird und vorher kein Squad hatte, bekommt die Kandidaten-ID des Ankers (`T1-S5`). Damit läuft der Trim ohne eigene Ausnahme an ihm vorbei — er ist ab dann Squad-Mitglied wie jedes andere. Kein Filter, keine Sonderliste.
2. **Roster aus dem finalen Atom.** `plan.virtualSquads` liest die Zusammensetzung aus den Kandidaten-Listen statt aus dem Snapshot. Gruppen, deren Spieler komplett von anderen Clans zurückgeholt wurden, fallen aus dem Ergebnis.
3. **`allMembers` entfernt** — nach 2. nur noch geschrieben, nie gelesen.
4. Kommentar zur Clan-Cohesion-Penalty korrigiert: sie ist strukturell immer null und ein reines Sicherheitsnetz, kein aktiver Steuerungsmechanismus.

### `utils/tb-discord-helpers.js`

`divided!`, die `moved`/`stay`-Spalte, der `movedOf`-Parameter, das `moved`-Feld und der zugehörige Sortier-Branch sind entfernt. Der Blockkopf sagt jetzt immer `(moved together)` — als Aussage, nicht als Urteil.

**Kein neues Symbol.** Ein squadloser Spieler, den ein Clan-Tag hereingezogen hat, ist bereits erkennbar: die Quell-Squad-Spalte zeigt `UNASSIGNED`.

```
Virtual Squad: [3DP] ⚓ Alpha · 5p · Ø26.1μ · 2★ (moved together)
  31.4μ★ ◆ Alpha     [3DP] Sparrow
  24.5μ  ◆ UNASSIGN… [3DP] Kovacs      ← war squadlos, per Tag gezogen
```

Dazu zwei sachlich falsche Kommentare korrigiert (die Cohesion-Penalty bewertet Splits über `min(onT1, onT2) * 75` und ist gegenüber Bewegung indifferent — sie steuert den Scrambler *nicht* von Clan-Squads weg).

### Tests

- **Neu:** `runVirtualSquadAtomicityTest` in `scrambler-test-runner.js` — 200 Läufe über 4 Szenarien, prüft gegen den echten Algorithmus, dass jede Gruppe in `plan.virtualSquads` entweder vollständig oder gar nicht bewegt wird. Das ist der Ersatz für den entfernten Laufzeit-Guard.
- `embed-format-test.js`: `divided!`-Fixture raus, UNASSIGNED-Fall rein. Die Oversized-Fixture bewegt jetzt ganze Gruppen statt halbe, weil ein halb bewegtes Virtual Squad kein möglicher Zustand mehr ist.

Der Renderer-Test baut seine Pläne von Hand und ruft den Scrambler nie auf — er belegt nur, *dass* gerendert wird, nicht *was* der Scrambler erzeugen kann. Deshalb liegt der Invariantenschutz bewusst im Scrambler-Runner.

### Doku

- **Korrektur eines Fehlers aus derselben Sitzung:** Der Algorithmus-Abschnitt behauptete „a player in a squad only ever moves together with their whole squad". Das gilt bei aktivem Clan Grouping nicht — mit `clanGroupingPullEntireSquads: false` (Default) werden Clan-Mitglieder aus ihren Squads gelöst, der Rest bleibt als eigenes Atom zurück. Das steht jetzt als eigener Absatz in der Clan-Sektion: *clan cohesion is bought with squad cohesion*.
- Cap-Enforcement und Cohesion-Zusage präzisiert, inklusive der drei Fälle, die **nicht** abgedeckt sind (siehe unten).
- `enableClanTagGrouping`-Optionsbeschreibung im Plugin: Verweise auf „Phase 1" und „Phase 3" entfernt.

## Auswirkungen

### Verhalten im Betrieb

| | vorher | nachher |
|---|---|---|
| Report meldet `divided!` bei intaktem Clan | in bis zu 57 % der Clan-Blöcke bei geteilten Squads | nicht mehr möglich |
| Block zeigt Spieler, die mit einer anderen Gruppe reisten | ja, inkl. verfälschter `Np · Øμ`-Kopfzeile | nein |
| Unassigned Clan-Mitglied kann einzeln verschoben werden | ja (nur bei Overcap) | nein |
| Team bleibt über dem Cap | seltener | minimal häufiger |

Der letzte Punkt ist der einzige Preis: Wenn nach dem Swap ein Team über `max(50, ceil(n/2))` liegt und nur noch clan-gebundene unassigned Spieler übrig sind, wird der Overcap toleriert statt aufgelöst.

### Regression

Keine. Bulk-Suite unverändert: 2500 Läufe, 100 % Diff ≤ 1, Clan-Kohäsion 1032/1032, ~23 ms Schnitt. Beide Suiten grün.

### Nicht abgedeckt — bewusst

Die Zusage lautet präzise: *eine Clan-Gruppe, die gemeinsam auf einem Team startet und gruppiert wurde, bleibt im Plan zusammen.* Außerhalb davon:

- **Cross-Team-Clans** werden nicht zusammengeführt (Design, `tb-scrambler.js` Pre-Phase).
- **Clans über `maxClanGroupSize`** (Default 18) fliegen komplett aus der Gruppierung und bekommen gar kein Virtual Squad.
- **RCON-Moves können scheitern.** Der Report zeigt den Plan, nicht das Ergebnis — `tb-swap-executor.js` meldet `failedToMove` separat.

### Bekannte Kanten

- Sind *alle* Mitglieder eines Clans squadlos, ist der Anker selbst ein Pseudo-Squad; die Spieler erben dann eine ID der Form `Unassigned - <eosID>`. Kosmetisch unschön, funktional korrekt (nicht-`null`, also trim-sicher).
- Das interne Unassigned-Log zählt gefaltete Clan-Mitglieder nicht mehr mit. Für die Sicht des Algorithmus richtiger, aber die Log-Zeile hat ihre Bedeutung geändert. Die Discord-Übersicht liest `tb.server.players` und zeigt weiterhin die echte Serverzahl.
- **Der Trim-Pfad ist nicht empirisch getestet.** Er feuert nur bei Overcap nach dem Swap, was die Overcap-Penalty (10000 pro Spieler) verhindert — in 200 Messläufen mit 100 Spielern 0×. Die Absicherung ist strukturell begründet, nicht gemessen.

## Verifikation

Das Repo hat keine `package.json`; das ESM-Layout muss gestellt werden.

```bash
# Renderer
docker run --rm -v "$PWD":/src:ro node:20 sh -c 'mkdir -p /work/core \
  && cp -r /src /work/app \
  && echo "{\"type\":\"module\"}" > /work/app/package.json \
  && echo "export default { verbose() {} };" > /work/core/logger.js \
  && cd /work/app && node testing/embed-format-test.js'

# Scrambler (im selben Layout)
node testing/scrambler-test-runner.js
```

Erwartete Ausgabe des neuen Tests:

```
🧪 VIRTUAL SQUAD ATOMICITY (200 runs per scenario)
   ✅ Two clans sharing a squad (players only): 400 rosters (190 rendered), none torn apart
   ✅ Two clans sharing a squad (entire squads): 400 rosters (179 rendered), none torn apart
   ✅ Clan across multiple squads: 600 rosters (263 rendered), none torn apart
   ✅ Low pop + 15-member clan: 200 rosters (0 rendered), none torn apart
```

**Gegenprobe:** Setzt man im Ergebnisaufbau des Scramblers wieder den Snapshot statt der Kandidaten-Liste ein, muss dieser Test in den beiden Collision-Szenarien fehlschlagen. Tut er das nicht, greift Ursache 1 nicht mehr und der zweite Fix wäre überflüssig.

## Offen, nicht Teil dieser Arbeit

- Der ELO-Pro-Stack-Test schlägt seit `fd0fa28` deterministisch fehl (15er-Squad passt nicht ins Churn-Budget von ~11 + 3 Grace). In `testing/README.md` dokumentiert, braucht eine eigene Entscheidung: Erwartung anpassen oder Squad-Größe im Fixture senken.
- Toter Code aus `fd0fa28`: `winStreakTeam` in der Scrambler-Signatur (nie gelesen), `locked` auf Virtual Squads (nur gesetzt).
- Benchmark „~70–95 ms" in `README.md` und im Scrambler-Header — gemessen ~5–25 ms, aber hardwareabhängig, deshalb unangetastet.

## Anhang: Wem gehört was in den zwei gemischten Dateien

`utils/tb-discord-helpers.js` und `testing/embed-format-test.js` trugen beim Start bereits uncommittete Arbeit am Virtual-Squad-Report. Der Diff enthält beides.

**`utils/tb-discord-helpers.js` — Clan-Kohäsions-Arbeit:**

| Stelle | Änderung |
|---|---|
| Header-Kommentar | `"moved together" or "divided!"` raus, „always travels whole" + UNASSIGNED-Hinweis rein |
| `teamVirtual`-Kommentar | Cohesion-Penalty-Behauptung korrigiert |
| Virtual-Squad-Schleife | `const divided` gelöscht, Header-Ternary → statisch, `movedOf:` aus dem Aufruf |
| `movers`-Kommentar | Stayer-Satz entfernt |
| `buildPlayerRows` | `movedOf` aus Signatur und Doc-Kommentar |
| Zeilenaufbau | `moved`-Feld, Sortier-Branch und `moved`-Spalte entfernt |
| `pushChunkedFields`-Kommentar | `divided`-Nebensatz entfernt |

**`utils/tb-discord-helpers.js` — vorbestehende Arbeit, unangetastet:** `squadNameByKey` mit Doppelschlüssel, `anchorLabelOf`, Richtungs-Divider, Legenden-Einträge `μ`/`Ø`/`⚓`, `μ`-Einheit in der ELO-Spalte, `reserve` 320 → 420.

**`testing/embed-format-test.js` — Clan-Kohäsions-Arbeit:** Check umbenannt, `dividedClan`-Fixture und -Check ersetzt durch `UNASSIGNED_PLAYERS` / `unassignedClan`, Kommentar und Bewegungsmuster der Oversized-Fixture, `--print`-Schleife.

**`testing/embed-format-test.js` — vorbestehende Arbeit, unangetastet:** `isDivider`/`dividers` samt Divider-Check, `anchorId` in allen Fixtures, `⚓ Alpha`-Assertion, μ/Ø/⚓-Legendenprüfungen, `every ELO row carries the μ unit`, Divider-Assertions.

> **Achtung:** Die Oversized-Fixture (`crowded`) bewegte vorher jeden zweiten Spieler, jedes Virtual Squad war also halb bewegt. Jetzt bewegen sich alle. Die Zeilenzahl bleibt gleich, die Mover-Zahlen in den Feldnamen ändern sich. Falls `reserve = 420` gegen die alte Fixture austariert wurde, ist das jetzt ein anderer Stresstest — er ist grün, inklusive Truncation-Assertion.
