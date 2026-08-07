# Diff: Clan-Kohäsion garantieren, `divided!` entfernen

Vollständiger Arbeitsstand gegen `a77c64d` (Merge PR #10, Branch `legacy`).
Erzeugt am 2026-08-07.

> **Achtung — zwei Dateien enthalten fremde Arbeit.**
> `utils/tb-discord-helpers.js` und `testing/embed-format-test.js` trugen beim Start dieser
> Sitzung bereits uncommittete Änderungen (Virtual-Squad-Discord-Report: `⚓`-Anker, `μ`-Einheit,
> Richtungs-Divider, erweiterte Legende, `reserve` 320→420). Diese sind hier mit enthalten und
> **nicht** Teil der Clan-Kohäsions-Arbeit. Die Zuordnung steht in
> [`clan-cohesion-summary.md`](./clan-cohesion-summary.md#anhang-wem-gehört-was-in-den-zwei-gemischten-dateien).

## Kern der Änderung

| Datei | Rolle |
|---|---|
| `utils/tb-scrambler.js` | Beide Ursachen behoben: Squad-Identität für gefaltete Spieler, Roster aus dem finalen Atom |
| `utils/tb-discord-helpers.js` | `divided!` / `moved` / `stay` entfernt (+ fremde WIP) |
| `testing/scrambler-test-runner.js` | Neuer Invariantentest als Ersatz für den gelöschten Guard |
| `testing/embed-format-test.js` | `divided!`-Test raus, UNASSIGNED-Test rein (+ fremde WIP) |
| `README.md`, `testing/README.md`, `plugins/team-balancer.js`, `testing/mock-data-generator.js` | Doku-Korrekturen |

## Vollständiger Diff

~~~~diff
diff --git a/README.md b/README.md
index 8e797d8..f7190ff 100644
--- a/README.md
+++ b/README.md
@@ -6,7 +6,7 @@
 
 Tracks dominant win streaks and rebalances teams using a squad-preserving scramble algorithm. Designed for Squad servers to avoid steamrolling, reduce churn, and maintain match fairness over time.
 
-Scramble execution swaps entire squads or unassigned players, balancing team sizes while respecting the 50-player cap and preserving squad cohesion. Includes dry-run mode, configurable thresholds, and fallback logic for emergency breakup squads in the worst case if needed.
+Scramble execution swaps entire squads or unassigned players, balancing team sizes while respecting the 50-player cap and preserving squad cohesion. The scramble never splits a group: if numerical balance would require it, the residual imbalance is tolerated instead. Includes dry-run mode and configurable thresholds.
 
 ---
 
@@ -30,7 +30,7 @@ Scramble execution swaps entire squads or unassigned players, balancing team siz
 
 * **Seed Auto-Scramble**: Automatically scrambles teams at the end of a Seed round, ensuring balanced teams as the server fills up.
 
-* **ELO-Weighted Balancing**: Optional integration with EloTracker. When `useEloForBalance` is enabled, the scoring function switches to an ELO-weighted branch: a composite penalty (50% Mean ELO diff + 50% Top-15 ELO diff) + veteran parity penalty + numerical balance. The standard heuristic penalties (churn, anchor, cohesion, infantry overload) are replaced entirely, not supplemented.
+* **ELO-Weighted Balancing**: Optional integration with EloTracker. When `useEloForBalance` is enabled, the scoring function switches to an ELO-weighted branch: a composite penalty (60% Mean ELO diff + 40% Top-15 ELO diff) + veteran parity penalty + numerical balance. The heuristic penalties (churn, anchor, infantry overload) are replaced entirely, not supplemented; the clan cohesion penalty runs in both modes.
 
 * **Discord Integration**: Administer the plugin via Discord, mirror RCON broadcasts, and view detailed swap plans.
 
@@ -76,29 +76,28 @@ Prevents players from changing teams immediately after a scramble. When TeamBala
 
 ## Scramble Algorithm (Optimal Exhaustive Search)
 
-Operates using a four-phase dynamic escalation system to ensure perfect numerical parity while protecting the core identity and cohesion of existing teams.
+Operates as a single-phase exhaustive search over squad-level swaps. The search moves whole units and never takes a subset of one, so numerical parity is reached purely by choosing which units to trade. With Clan Tag Grouping off, a unit is an in-game squad. With it on, clan members are regrouped into virtual squads *before* the search starts — that regrouping does pull players out of their squads, see [Clan Tag Grouping](#clan-tag-grouping-optional).
 
 * **Data Prep**: Normalizes squad snapshots and treats unassigned players as individual "pseudo-squads" for maximum movement flexibility.
 
 * **Target Calc**: Computes ideal player swap targets (default 50% churn) adjusted by current team population deltas.
 
-* **Tiered Optimization (2000 Iterations)**:
-  * **Phase 1 (Pure Swaps)**: Focuses exclusively on whole-squad moves to maximize friend-group cohesion.
-  * **Phase 2 (Surgical Unlocked)**: Dynamically shatters one random unlocked squad if balance remains poor to provide precision adjustments.
-  * **Phase 3 (Surgical Locked)**: A late-stage fallback that allows breaking a single locked squad to resolve extreme parity issues.
-  * **Phase 4 (Nuclear Option)**: A final resort that decomposes all squads to achieve maximum numerical balance. Runs for the last 5 iterations.
-  * **With Clan Tag Grouping enabled**: same-team clan members are folded into "virtual squads" anchored on the squad with the most clan members; Phase 1 swaps them as one unit, and Phases 2/3 only shatter a virtual squad when no non-clan squad is eligible.
+* **Squad-Level Optimization (2000 Iterations)**:
+  * Each iteration shuffles the candidate lists and greedily packs whole squads (largest first, single players last) until the per-side churn target is met, allowing a 3-player overshoot so a squad that slightly exceeds the target still fits.
+  * The movable units are formed squads, unassigned players (as size-1 pseudo-squads), and — with Clan Tag Grouping enabled — clan virtual squads. All three move atomically: the search never takes part of a unit.
+  * Squad lock status does not influence the search. A locked squad is traded as one unit exactly like an unlocked one, and neither is ever split.
+  * **Known limitation**: a squad larger than the per-side churn target plus the 3-player grace cannot be selected at all. On low-pop servers with a low `scramblePercentage`, large squads and large clan virtual squads may sit out a scramble entirely.
 
-* **ELO Integration (Optional)**: When ELO data is available, the scrambler uses a dedicated ELO-weighted scoring branch (composite Mean/Top-15 ELO diff + veteran parity + numerical balance). Standard heuristic penalties like churn, anchor rules, and cohesion weights are disabled in favor of ELO parity.
+* **ELO Integration (Optional)**: When ELO data is available, the scrambler uses a dedicated ELO-weighted scoring branch (composite Mean/Top-15 ELO diff + veteran parity + numerical balance). The heuristic penalties (churn, anchor rules, infantry overload) are disabled in favor of ELO parity; the clan cohesion penalty runs in both modes.
 
 * **Identity Preservation**: In heuristic (non-ELO) mode, a penalty discourages moving more than 2 large infantry squads from a single team per scramble.
 
-* **Cap Enforcement**: A final corrective pass trims overages in priority order: Unassigned → Unlocked Squad Members. Locked players are never moved during cap enforcement.
+* **Cap Enforcement**: A final corrective pass trims team overages using loose unassigned players only. Squad members are never moved during trimming, and neither are squadless players that a clan tag folded into a virtual squad — they carry their group's squad identity from that point on. Once no loose players are left, the remaining overage is tolerated and logged as a warning rather than breaking a group.
 
 ### Performance Benchmarks
 * **Execution Time**: ~70–95ms per search (exhaustive 2000-attempt pass).
 * **Balance Success**: 99.9% rate of achieving a team differential of ≤ 2 players.
-* **Cohesion**: Locked squads are preserved during Phases 1–2. Phase 3 may split one locked squad as a late-stage fallback. Phase 4 decomposes all squads.
+* **Cohesion**: The scramble never splits a unit, locked or not. Every player moved travels with their whole group; only loose unassigned players move alone. Three cases fall outside that guarantee: clans that already start split across teams (not consolidated by design), clans larger than `maxClanGroupSize` (dropped from grouping entirely), and RCON moves that fail during execution.
 
 ### Clan Tag Grouping (Optional)
 
@@ -108,9 +107,11 @@ When `enableClanTagGrouping` is on, the scrambler keeps players who share a clan
 
 * **Tag detection**: Player names are scanned for a leading clan tag via a five-strategy detector (ported from [squadjs-elo-tracker](https://github.com/mikebjoyce/squadjs-elo-tracker)), tried in order: bracket pairs (`[TAG]`, `【TAG】`, `╔TAG╗`), explicit separators (`TAG | Name`, `TAG // Name`), 2+ space gap, short ASCII ALL-CAPS (`KM Lookout`), and a bare-prefix fallback for Unicode/mixed-case prefixes (`KΛZ Korven`). Names with no visible tag/name boundary (e.g. `ABCJohnSmith`) yield no group.
 * **Matching**: Case-sensitive by default. Set `clanTagCaseSensitive: false` to normalize via NFD-decompose, lookalike mapping (`λ`→`a`, `я`→`r`, …), and uppercase, collapsing variants like `[Café]` / `[CAFE]` / `[CΛFE]`. Tags within `clanTagMaxEditDistance` Levenshtein distance are iteratively merged so transitive matches (`[AAA] ↔ [AAB] ↔ [ABB]`) collapse into one group.
-* **Virtual squads**: Per team, clan members are folded into a virtual squad anchored on the squad already holding the most clan members (tiebreak: larger size, lower ID). `clanGroupingPullEntireSquads` toggles whether non-clan teammates travel along (default: only clan members are pulled).
+* **Virtual squads**: Per team, clan members are folded into a virtual squad anchored on the squad already holding the most clan members (tiebreak: larger size, lower ID). `clanGroupingPullEntireSquads` toggles whether non-clan teammates travel along (default: only clan members are pulled). Squadless players count too — a player with the tag and no squad is pulled into the group and treated as a squad member from then on, including by cap enforcement.
+* **This splits the source squads**: with the default `clanGroupingPullEntireSquads: false`, clan members are lifted out of their squads and the remainder stays behind as its own unit, free to move the other way. That is the intended trade — clan cohesion is bought with squad cohesion. Set the option to `true` to move contributing squads wholesale instead.
 * **Overlapping clans**: Two clans sharing a squad each keep their own virtual squad. A squad already used as another clan's anchor stays available as a source — the second clan pulls its members out of it, and `clanGroupingPullEntireSquads` never drags it along wholesale. Only if *every* squad holding a clan's members is already anchored elsewhere do the two clans merge into one unit.
-* **Phase behavior**: Phase 1 swaps virtual squads atomically. Phases 2/3 prefer non-clan victims and only break a virtual squad when no other option exists; a soft scoring penalty further discourages re-splitting once decomposition begins.
+* **Swap behavior**: Virtual squads are swapped atomically as a single unit and are never broken — the report labels every listed group `moved together` and has no branch for anything else. `scrambler-test-runner.js` asserts that invariant against the real algorithm. A soft scoring penalty stays in place as a safety net.
+* **Discord report**: Each virtual squad block names its anchor squad with `⚓` (e.g. `Virtual Squad: [3DP] ⚓ Alpha · 4p · Ø26.1μ · 2★`), and every player row shows its ELO as `26.1μ★`. The per-row squad column names each player's real in-game squad, so a `◆` row reading `UNASSIGNED` is a squadless player the clan tag pulled in. The two swap directions are separated by a horizontal rule, and the embed footer glosses every symbol that actually appears in the report.
 
 **Cross-team clans are intentionally not consolidated** — if a clan starts split across teams, each side is treated independently.
 
@@ -165,6 +166,7 @@ Add to your `config.json`:
    "maxClanGroupSize": 18,
    "clanTagMaxEditDistance": 1,
    "clanTagCaseSensitive": true,
+   "clanTagIgnoreList": [],
    "clanGroupingPullEntireSquads": false,
    "changeTeamRetryInterval": 50,
   "maxScrambleCompletionTime": 15000,
diff --git a/plugins/team-balancer.js b/plugins/team-balancer.js
index 0632a03..648b861 100644
--- a/plugins/team-balancer.js
+++ b/plugins/team-balancer.js
@@ -288,7 +288,7 @@ export default class TeamBalancer extends BasePlugin {
       enableClanTagGrouping: {
         default: false,
         type: 'boolean',
-        description: 'Keep players sharing a clan tag (e.g. [ABC]) together when they are on the same team during a scramble. Forms per-team "virtual squads" so Phase 1 swaps clan members atomically and Phase 3 only breaks them as a last resort. Cross-team clan splits are NOT consolidated by design.'
+        description: 'Keep players sharing a clan tag (e.g. [ABC]) together when they are on the same team during a scramble. Forms per-team "virtual squads" that are swapped atomically as one unit and are never broken. Cross-team clan splits are NOT consolidated by design.'
       },
       minClanGroupSize: {
         default: 2,
diff --git a/testing/README.md b/testing/README.md
index f11dee5..fd31417 100644
--- a/testing/README.md
+++ b/testing/README.md
@@ -17,7 +17,7 @@ Stress-tests the Scrambler algorithm using mock data. Standalone — no server r
 **Coverage:**
 - Standard scenarios: 50/50, imbalances (45/55, 20/80, etc.), low pop, max capacity, seeding mode
 - Squad-structure edge cases: All-locked, David-vs-Goliath
-- ELO balancing: pro-stack detection scenario
+- ELO balancing: pro-stack detection scenario — **currently fails by design.** The scenario puts 15 pros into a single squad and expects ≥5 of them to be moved at `scramblePercentage: 0.2`. Since the squad-preserving refactor the scrambler can no longer split a squad, and a 15-man squad does not fit the per-side target of ~11 + 3 grace, so 0 pros move. Either the expectation or the scenario's squad size needs adjusting.
 - **Clan tag grouping** (when `enableClanTagGrouping` is on):
   - Same-team clan in multiple squads (default vs `pullEntireSquads: true`)
   - Cross-team clan (each side cohesive, no forced cross-team consolidation)
diff --git a/testing/embed-format-test.js b/testing/embed-format-test.js
index 936b0b9..22cba74 100644
--- a/testing/embed-format-test.js
+++ b/testing/embed-format-test.js
@@ -46,6 +46,9 @@ const withPlan = (moves, extras = {}) => {
 const isVirtual = (f) => f.name.includes('Clan Grouping');
 const virtualFields = (e) => e.fields.filter(isVirtual);
 const regularFields = (e) => e.fields.filter((f) => f.name.includes('➔') && !isVirtual(f));
+// The direction divider: a rule of ━ with a zero-width space as its value.
+const isDivider = (f) => /^━+$/.test(f.name);
+const dividers = (e) => e.fields.filter(isDivider);
 const linesOf = (f) => f.value.replace(/```text\n?|\n?```/g, '').split('\n');
 // Player rows are indented by two spaces; block headers are not, separators are blank.
 const rowsIn = (fields) => fields.flatMap(linesOf).filter((l) => l.startsWith('  ') && l.trim());
@@ -72,7 +75,10 @@ const CLAN_ELO = new Map([
   ['e4', { mu: 27.35, roundsPlayed: 2 }],
   ['e5', { mu: 26.2, roundsPlayed: 50 }]
 ]);
-const VS_3DP = { teamID: '1', tag: '3DP', members: ['e1', 'e2', 'e6'], pulled: ['e3'] };
+// Alpha holds two of the three clan members, so it is the anchor by the scrambler's own rule.
+const VS_3DP = {
+  teamID: '1', tag: '3DP', anchorId: 'T1-S1', members: ['e1', 'e2', 'e6'], pulled: ['e3']
+};
 const ROSTER_3DP = [...VS_3DP.members, ...VS_3DP.pulled];
 const CLAN_MOVES = [...ROSTER_3DP, 'e4'].map((eosID) => ({ eosID, targetTeamID: '2' }))
   .concat([{ eosID: 'e5', targetTeamID: '1' }]);
@@ -90,15 +96,29 @@ check('fields are ordered: balance, then per team virtual squads before regular
   assert.strictEqual(names[1],
     '🔗 Team 1 (USA) ➔ Team 2 (RGF) Clan Grouping (Virtual Squads) [4 players]');
   assert.ok(names[2].startsWith('Team 1 (USA) ➔ Team 2 (RGF)'), `3rd field: ${names[2]}`);
-  assert.ok(names[3].startsWith('Team 2 (RGF) ➔ Team 1 (USA)'), `4th field: ${names[3]}`);
-  assert.strictEqual(names.length, 4, `team 2 has no virtual squad: ${names}`);
+  assert.ok(isDivider(withClans.fields[3]), `4th field should be the divider: ${names[3]}`);
+  assert.ok(names[4].startsWith('Team 2 (RGF) ➔ Team 1 (USA)'), `5th field: ${names[4]}`);
+  assert.strictEqual(names.length, 5, `team 2 has no virtual squad: ${names}`);
+});
+
+check('the divider separates the two directions exactly once', () => {
+  const found = dividers(withClans);
+  assert.strictEqual(found.length, 1, `expected one divider, got ${found.length}`);
+  // An empty value is rejected by Discord, and a ➔ in the name would make it read as a block.
+  assert.strictEqual(found[0].value, '​', 'divider needs a zero-width space as its value');
+  assert.ok(!found[0].name.includes('➔'), `divider name must stay free of ➔: ${found[0].name}`);
+  const idx = withClans.fields.indexOf(found[0]);
+  assert.ok(withClans.fields.slice(0, idx).every((f) => !f.name.startsWith('Team 2')),
+    'nothing from team 2 above the divider');
+  assert.ok(withClans.fields.slice(idx + 1).every((f) => !f.name.includes('Team 1 (USA) ➔')),
+    'nothing from team 1 below the divider');
 });
 
 check('the virtual squad is one block holding its whole roster', () => {
   const lines = virtualFields(withClans).flatMap(linesOf);
   const headers = lines.filter((l) => l.startsWith('Virtual Squad:'));
   assert.strictEqual(headers.length, 1, `expected one block, got: ${headers}`);
-  assert.ok(headers[0].startsWith('Virtual Squad: [3DP] 4p · Ø'), `header: ${headers[0]}`);
+  assert.ok(headers[0].startsWith('Virtual Squad: [3DP] ⚓ Alpha · 4p · Ø'), `header: ${headers[0]}`);
   for (const name of ['Sparrow', 'Kovacs', 'Okonkwo', 'Halloway']) {
     assert.strictEqual(rowsIn(virtualFields(withClans)).filter((r) => r.includes(name)).length, 1,
       `${name} not on exactly one row of the virtual block`);
@@ -123,28 +143,75 @@ check('the source-squad column shows the real in-game squad', () => {
   assert.ok(/◇ Alpha\s+Halloway$/.test(rowFor('Halloway')), `Halloway: "${rowFor('Halloway')}"`);
 });
 
-check('a fully moved virtual squad reads "moved together", without a moved/stay column', () => {
+// A listed virtual squad always travels whole — the scrambler swaps it as one atom and nothing
+// afterwards singles a member out. The invariant itself is asserted against the real algorithm
+// in scrambler-test-runner.js; here we only pin the rendering that relies on it.
+check('a virtual squad block reads "moved together" and carries no moved/stay column', () => {
   const lines = virtualFields(withClans).flatMap(linesOf);
   assert.ok(lines[0].endsWith('(moved together)'), `header: ${lines[0]}`);
   assert.ok(!/\b(moved|stay)\s/.test(rowsIn(virtualFields(withClans)).join('\n')),
-    'moved/stay column should only appear when the squad is divided');
+    'there is no moved/stay column any more');
 });
 
 // Same plan, but the virtual squad pulled nobody along: no ◇ anywhere in the report.
 const noPulled = await build(withPlan(CLAN_MOVES, {
-  virtualSquads: [{ teamID: '1', tag: '3DP', members: ['e1', 'e2', 'e6'], pulled: [] }]
+  virtualSquads: [
+    { teamID: '1', tag: '3DP', anchorId: 'T1-S1', members: ['e1', 'e2', 'e6'], pulled: [] }
+  ]
 }));
 // And a plan without ELO data at all: no ★ anywhere.
 const noElo = await build(withPlan(CLAN_MOVES, { virtualSquads: [VS_3DP] }),
   CLAN_PLAYERS, CLAN_SQUADS, null);
 
+// Names and squad names are player-chosen, and Squad players really do call themselves things
+// like BJØRN. Every symbol the legend explains is put into the body as user data here, on a plan
+// that has neither ELO data nor clan grouping, so a legend built by scanning the rendered text
+// would claim all six.
+const SPOOF_PLAYERS = [
+  player('s1', 'BJØRN Håkonsen', '1', '1'),
+  player('s2', 'μSoldier ★彡', '1', '1'),
+  player('s3', '◆Ace◇ ⚓Anchor', '2', '2')
+];
+const SPOOF_SQUADS = [
+  { squadID: '1', teamID: '1', squadName: 'MÖRSER Ø★' },
+  { squadID: '2', teamID: '2', squadName: '⚓ ANCHOR ◆' }
+];
+const spoof = await build(withPlan(
+  [{ eosID: 's1', targetTeamID: '2' }, { eosID: 's2', targetTeamID: '2' },
+    { eosID: 's3', targetTeamID: '1' }]),
+  SPOOF_PLAYERS, SPOOF_SQUADS, null);
+
 check('the legend covers every symbol actually used, and only those', () => {
   assert.strictEqual(withClans.footer?.text,
-    '★ regular (10+ rounds) · ◆ clan member (virtual squad) · ◇ pulled with squad');
+    'μ ELO rating · Ø squad average · ★ regular (10+ rounds) · ' +
+    '◆ clan member (virtual squad) · ◇ pulled with squad · ⚓ anchor squad');
   assert.ok(!noPulled.footer.text.includes('◇'), `stale ◇: ${noPulled.footer.text}`);
   assert.ok(noPulled.footer.text.includes('◆'), 'clan marker legend missing');
-  assert.ok(!noElo.footer.text.includes('★'), `stale ★ without ELO: ${noElo.footer.text}`);
+  for (const symbol of ['★', 'μ', 'Ø']) {
+    assert.ok(!noElo.footer.text.includes(symbol),
+      `stale ${symbol} without ELO: ${noElo.footer.text}`);
+  }
   assert.ok(noElo.footer.text.includes('◆'), 'clan marker legend missing without ELO');
+  assert.ok(noElo.footer.text.includes('⚓'), 'anchor legend missing without ELO');
+});
+
+check('player and squad names cannot spoof a legend entry', () => {
+  const body = spoof.fields.map((f) => f.value).join('\n');
+  // Precondition: the user data really is in the report, otherwise this proves nothing.
+  for (const symbol of ['μ', 'Ø', '★', '◆', '◇', '⚓']) {
+    assert.ok(body.includes(symbol), `fixture no longer puts ${symbol} in the body`);
+  }
+  // No ELO map and no virtual squads, so the report can contain none of them as real markers.
+  assert.strictEqual(spoof.footer, undefined,
+    `legend built from names: ${JSON.stringify(spoof.footer?.text)}`);
+});
+
+check('every ELO row carries the μ unit, matching the block headers', () => {
+  for (const row of [...rowsIn(virtualFields(withClans)), ...rowsIn(regularFields(withClans))]) {
+    assert.ok(/\d\.\dμ[★ ]/.test(row), `row without μ: "${row}"`);
+  }
+  assert.ok(!/\d\.\dμ/.test(rowsIn(regularFields(noElo)).join('\n')),
+    'no μ column when there is no ELO data at all');
 });
 
 check('rows are sorted by mu descending', () => {
@@ -157,25 +224,25 @@ check('listed rows account for exactly the planned moves', () => {
   assert.strictEqual(total, CLAN_MOVES.length, `${total} rows vs ${CLAN_MOVES.length} moves`);
 });
 
-// Only one of the four roster players actually moves.
-const dividedClan = await build(withPlan(
-  [{ eosID: 'e1', targetTeamID: '2' }, { eosID: 'e5', targetTeamID: '1' }],
-  { virtualSquads: [VS_3DP] }
-));
-
-check('a torn-apart virtual squad reads "divided!" and marks moved/stay, movers first', () => {
-  const lines = virtualFields(dividedClan).flatMap(linesOf);
-  assert.ok(lines[0].endsWith('(divided!)'), `header: ${lines[0]}`);
-  const rows = rowsIn(virtualFields(dividedClan));
-  assert.strictEqual(rows.length, 4, 'the whole roster stays visible when divided');
-  assert.ok(rows[0].startsWith('  moved') && rows[0].includes('Sparrow'), `first row: "${rows[0]}"`);
-  assert.strictEqual(rows.filter((r) => r.startsWith('  moved')).length, 1, 'exactly one mover');
-  assert.strictEqual(rows.filter((r) => r.startsWith('  stay')).length, 3, 'three stay');
-  const moved = rowsIn(virtualFields(dividedClan)).filter((r) => r.startsWith('  moved')).length;
-  assert.strictEqual(moved + rowsIn(regularFields(dividedClan)).length, 2, 'row count vs plan');
-  // The field count tracks who changes team, not how many rows are shown.
-  assert.ok(virtualFields(dividedClan)[0].name.endsWith('[1 players]'),
-    `count must exclude the stayers: ${virtualFields(dividedClan)[0].name}`);
+// An unassigned player folded into the virtual squad by their clan tag: the source-squad column
+// is what makes that visible, so it must survive.
+const UNASSIGNED_PLAYERS = [
+  player('u1', '[3DP] Sparrow', '1', '1'),
+  player('u2', '[3DP] Kovacs', '1', null),   // no squad — pulled in by tag alone
+  player('u3', 'Ridley', '2', '3')
+];
+const unassignedClan = await build(withPlan(
+  [{ eosID: 'u1', targetTeamID: '2' }, { eosID: 'u2', targetTeamID: '2' }],
+  { virtualSquads: [{ teamID: '1', tag: '3DP', anchorId: 'T1-S1', members: ['u1', 'u2'], pulled: [] }] }
+), UNASSIGNED_PLAYERS, CLAN_SQUADS, null);
+
+check('a squadless clan member is recognisable by its UNASSIGNED source squad', () => {
+  const rows = rowsIn(virtualFields(unassignedClan));
+  const kovacs = rows.find((r) => r.includes('Kovacs'));
+  assert.ok(/◆ UNASSIGN/.test(kovacs), `Kovacs row must name UNASSIGNED: "${kovacs}"`);
+  assert.ok(/◆ Alpha/.test(rows.find((r) => r.includes('Sparrow'))), 'Sparrow keeps its real squad');
+  assert.ok(virtualFields(unassignedClan)[0].value.includes('(moved together)'),
+    'the group still travels whole');
 });
 
 // A virtual squad nobody was moved out of: the report is about what changes, so it is omitted.
@@ -187,17 +254,21 @@ const untouchedClan = await build(withPlan(
 check('a virtual squad nobody moved out of is omitted entirely', () => {
   assert.strictEqual(virtualFields(untouchedClan).length, 0, 'untouched group should not be shown');
   assert.ok(!untouchedClan.fields.some((f) => f.name.startsWith('Team 1')), 'team 1 moves nobody');
-  assert.ok(!/[◆◇]/.test(untouchedClan.footer.text), 'no clan markers, so no clan legend');
+  assert.ok(!/[◆◇⚓]/.test(untouchedClan.footer.text), 'no clan markers, so no clan legend');
   assert.strictEqual(rowsIn(regularFields(untouchedClan)).length, 1, 'only Ridley moves');
+  assert.strictEqual(dividers(untouchedClan).length, 0,
+    'one direction only, so nothing to divide');
 });
 
 const noClans = await build(withPlan(CLAN_MOVES));
 
-check('no virtual squads: no clan field, no clan markers, only the ★ legend', () => {
+check('no virtual squads: no clan field, no clan markers, only the ELO legend', () => {
   assert.strictEqual(virtualFields(noClans).length, 0, 'clan field should be absent');
-  assert.ok(!/[◆◇]/.test(JSON.stringify(noClans)), 'markers should be absent');
-  assert.strictEqual(noClans.footer.text, '★ regular (10+ rounds)', `footer: ${noClans.footer?.text}`);
+  assert.ok(!/[◆◇⚓]/.test(JSON.stringify(noClans)), 'markers should be absent');
+  assert.strictEqual(noClans.footer.text,
+    'μ ELO rating · Ø squad average · ★ regular (10+ rounds)', `footer: ${noClans.footer?.text}`);
   assert.strictEqual(rowsIn(regularFields(noClans)).length, CLAN_MOVES.length, 'all movers listed');
+  assert.strictEqual(dividers(noClans).length, 1, 'both directions move, so one divider');
 });
 
 // ─── Oversized blocks: two 18-man clans on one team, plus 40 squadless players ───
@@ -213,8 +284,10 @@ const bigAll = [...big, ...unassigned];
 const bigBlock = await build(
   withPlan(bigAll.map((p) => ({ eosID: p.eosID, targetTeamID: '2' })), {
     virtualSquads: [
-      { teamID: '1', tag: 'LONGCLANA', members: big.slice(0, 18).map((p) => p.eosID), pulled: [] },
-      { teamID: '1', tag: 'LONGCLANB', members: big.slice(18).map((p) => p.eosID), pulled: [] }
+      { teamID: '1', tag: 'LONGCLANA', anchorId: 'T1-S1',
+        members: big.slice(0, 18).map((p) => p.eosID), pulled: [] },
+      { teamID: '1', tag: 'LONGCLANB', anchorId: 'T1-S2',
+        members: big.slice(18).map((p) => p.eosID), pulled: [] }
     ]
   }),
   bigAll,
@@ -233,9 +306,9 @@ check('every field stays within Discord limits, virtual and regular alike', () =
   assert.strictEqual(rowsIn(regularFields(bigBlock)).length, 40, 'lost players while chunking');
 });
 
-// ─── Oversized embed: 12 clan squads across both teams, each of them torn in half ───
-// A divided virtual squad lists its stayers as well, so the row count is no longer bounded by
-// the plan — enough blocks and the embed total passes 6000 even though every field is under 1024.
+// ─── Oversized embed: 12 clan squads across both teams, all of them moving ───
+// Every virtual squad renders its full roster, so enough blocks push the embed total past 6000
+// even though every single field stays under 1024.
 const crowdPlayers = [];
 const crowdSquads = [];
 const crowdVirtual = [];
@@ -246,13 +319,12 @@ for (const teamID of ['1', '2']) {
     crowdSquads.push({ squadID, teamID, squadName: `Squad ${s} Infantry` });
     members.forEach((eosID, i) =>
       crowdPlayers.push(player(eosID, `[CLAN${s}] LongishPlayerName${i}`, teamID, squadID)));
-    crowdVirtual.push({ teamID, tag: `CLAN${s}`, members, pulled: [] });
+    crowdVirtual.push({ teamID, tag: `CLAN${s}`, anchorId: `T${teamID}-S${squadID}`, members, pulled: [] });
   }
 }
 const crowded = await build(
   withPlan(
-    crowdPlayers.filter((_, i) => i % 2 === 0)
-      .map((p) => ({ eosID: p.eosID, targetTeamID: p.teamID === '1' ? '2' : '1' })),
+    crowdPlayers.map((p) => ({ eosID: p.eosID, targetTeamID: p.teamID === '1' ? '2' : '1' })),
     { virtualSquads: crowdVirtual }
   ),
   crowdPlayers,
@@ -285,7 +357,7 @@ check('reports that fit are left alone by the size budget', () => {
 
 // Sample output for eyeballing column alignment.
 if (process.argv.includes('--print')) {
-  for (const embed of [withClans, dividedClan]) {
+  for (const embed of [withClans, unassignedClan]) {
     console.log('\n─── sample embed ───');
     for (const f of embed.fields) console.log(`\n${f.name}\n${f.value}`);
     if (embed.footer) console.log(`\n${embed.footer.text}`);
diff --git a/testing/mock-data-generator.js b/testing/mock-data-generator.js
index 4ed1fd8..56eef25 100644
--- a/testing/mock-data-generator.js
+++ b/testing/mock-data-generator.js
@@ -227,10 +227,10 @@ export function generateScenario_ClanSquadCollision() {
 
 /**
  * Scenario: low-pop server with a 15-member clan spread across three squads
- * on Team 1, paired with a low scramble percentage. With Phase 1's fixed
+ * on Team 1, paired with a low scramble percentage. With the selector's fixed
  * 3-player grace and a per-side target of ~6 (60 players × 0.2), a 15-player
- * virtual squad can never fit the target window atomically — Phase 1 skips
- * it. The clan members stay together vacuously (they all started on T1 and
+ * virtual squad can never fit the target window atomically — the selector
+ * skips it. The clan members stay together vacuously (they all started on T1 and
  * nobody touches them); the algorithm balances by moving smaller non-clan
  * squads. Cohesion is preserved without atomically swapping the clan.
  *
@@ -399,7 +399,7 @@ export function generateScenario_AllLocked(count = 100, team1Ratio = 0.8) {
 
 /**
  * Generates "David vs Goliath": Team 1 has one massive unlocked squad, Team 2 has small locked squads.
- * Used to test surgical splitting of the large squad.
+ * Used to test that the large squad is traded as one atomic unit, never split.
  */
 export function generateScenario_DavidGoliath() {
   const players = [];
diff --git a/testing/scrambler-test-runner.js b/testing/scrambler-test-runner.js
index e5a0258..4aa830e 100644
--- a/testing/scrambler-test-runner.js
+++ b/testing/scrambler-test-runner.js
@@ -533,6 +533,7 @@ async function runAllTests() {
   });
 
   await runClanCollisionTest(20);
+  await runVirtualSquadAtomicityTest(200);
 
   await runBulkTests(2500);
   await runClanBulkTest(500);
@@ -540,6 +541,63 @@ async function runAllTests() {
   await runDiagnosticClanTest(50);
 }
 
+/**
+ * Invariant guard for the Discord report: every virtual squad in plan.virtualSquads either
+ * moves in full or not at all. The report relies on this — it labels each block
+ * "moved together" and has no rendering branch for a torn-apart group, so a violation would
+ * silently produce a wrong report rather than a visibly broken one.
+ *
+ * Two ways this used to break, both fixed in tb-scrambler.js and both covered here:
+ *   - the roster was read off an allMembers snapshot taken before a later clan could reclaim
+ *     its own members out of the group (ClanSquadCollision reproduces it, 200/600 rosters
+ *     pre-fix at 300 runs per mode)
+ *   - an unassigned clan member kept squadID === null and the cap-enforcement trim picked it
+ *     off individually (LowPopLargeClan and the collision scenario both carry such players)
+ */
+async function runVirtualSquadAtomicityTest(runsPerMode = 200) {
+  console.log(`\n==================================================`);
+  console.log(`🧪 VIRTUAL SQUAD ATOMICITY (${runsPerMode} runs per scenario)`);
+  console.log(`==================================================`);
+
+  const scenarios = [
+    ['Two clans sharing a squad (players only)', generateScenario_ClanSquadCollision, { pullEntireSquads: false }],
+    ['Two clans sharing a squad (entire squads)', generateScenario_ClanSquadCollision, { pullEntireSquads: true }],
+    ['Clan across multiple squads', generateScenario_ClanGrouping, {}],
+    ['Low pop + 15-member clan', generateScenario_LowPopLargeClan, { scramblePercentage: 0.2 }]
+  ];
+
+  for (const [label, gen, opts] of scenarios) {
+    let rosters = 0, shown = 0, torn = 0;
+    let firstBreak = '';
+    for (let i = 0; i < runsPerMode; i++) {
+      const { players, squads } = gen();
+      const clanGroups = extractClanGroups(players, { minSize: 2, maxSize: 18, maxEditDistance: 1, caseSensitive: true });
+      const { squads: tfSquads, players: tfPlayers } = transformForScrambler(players, squads);
+      const plan = await Scrambler.scrambleTeamsPreservingSquads({
+        squads: tfSquads,
+        players: tfPlayers,
+        winStreakTeam: 1,
+        scramblePercentage: opts.scramblePercentage ?? 0.5,
+        clanGroups,
+        pullEntireSquads: opts.pullEntireSquads ?? false
+      });
+      const moved = new Set(plan.map((m) => m.eosID));
+      for (const vs of plan.virtualSquads ?? []) {
+        const roster = [...vs.members, ...vs.pulled];
+        rosters++;
+        const movers = roster.filter((id) => moved.has(id)).length;
+        if (movers > 0) shown++;
+        if (movers > 0 && movers < roster.length) {
+          torn++;
+          if (!firstBreak) firstBreak = ` — e.g. [${vs.tag}] T${vs.teamID}: ${movers}/${roster.length} moved`;
+        }
+      }
+    }
+    track(`${label}: ${rosters} rosters (${shown} rendered), none torn apart`, torn === 0,
+      ` — ${torn} torn${firstBreak}`);
+  }
+}
+
 /**
  * Regression guard: two clans sharing a squad must each stay cohesive.
  * Looped rather than a single runClanTest — the scrambler is randomized, and a
diff --git a/utils/tb-discord-helpers.js b/utils/tb-discord-helpers.js
index d038bb8..83a1fc0 100644
--- a/utils/tb-discord-helpers.js
+++ b/utils/tb-discord-helpers.js
@@ -22,8 +22,11 @@
  *     squad. When plan.virtualSquads is present (clan grouping built at
  *     least one group), each team gets a Clan Grouping field ahead of its
  *     regular squads: every virtual squad the plan touched is shown as one
- *     block with its full roster (◆ clan member, ◇ pulled along), tagged
- *     "moved together" or "divided!" — the latter adds a moved/stay column.
+ *     block with its full roster (◆ clan member, ◇ pulled along), headed by the
+ *     ⚓ anchor squad it was built around and tagged "moved together" — a listed
+ *     group always travels whole, the scrambler swaps it as one atom.
+ *     A ◆ row whose squad column reads UNASSIGNED is a squadless player the clan
+ *     tag pulled into the group.
  *     Those players are omitted from the regular squad blocks; virtual
  *     squads nobody moved out of are omitted entirely.
  *     buildScrambleCompletedEmbed(...)            — Post-execution summary embed.
@@ -236,12 +239,23 @@ export const DiscordHelpers = {
       for (const eosID of vs.pulled) clanByEos.set(eosID, { tag: vs.tag, pulled: true });
     }
 
-    const squadNameByKey = new Map(squads.map(s => [`${s.teamID}:${s.squadID}`, s.squadName]));
+    // Two keys per squad: the plain one for player rows, and the scrambler's candidate id
+    // (`T{teamID}-S{squadID}`, built in transformSquadJSData) so a virtual squad's anchorId is a
+    // direct lookup instead of a parse.
+    const squadNameByKey = new Map();
+    for (const s of squads) {
+      squadNameByKey.set(`${s.teamID}:${s.squadID}`, s.squadName);
+      squadNameByKey.set(`T${s.teamID}-S${s.squadID}`, s.squadName);
+    }
     const squadLabelOf = (eosID) => {
       const player = playerByEos.get(eosID);
       if (!player || player.squadID === null || player.squadID === undefined) return 'UNASSIGNED';
       return squadNameByKey.get(`${player.teamID}:${player.squadID}`) || `Squad ${player.squadID}`;
     };
+    // The real in-game squad a virtual squad was built around. Null when the plan predates the
+    // field, so an older plan renders without the ⚓ rather than breaking.
+    const anchorLabelOf = (vs) =>
+      vs.anchorId ? squadNameByKey.get(vs.anchorId) || 'UNASSIGNED' : null;
 
     // playersTotal counts every mover (the balance projection needs it); listedTotal counts only
     // those rendered in this direction's squad blocks — virtual squad members are pulled out and
@@ -368,36 +382,60 @@ export const DiscordHelpers = {
       return `${eosIDs.length}p · Ø${avg}μ · ${regs}★`;
     };
 
+    // Every player put into a block, and whether any block header named its anchor. The legend at
+    // the end is decided from these rather than from the rendered text — see there for why.
+    const listed = new Set();
+    let anchorListed = false;
+
     // Team 1's fields first, then team 2's; within a team the virtual squads come before the
     // regular squads, since a virtual squad is the unit the scrambler moves as a whole.
     for (const dir of ['1to2', '2to1']) {
       const data = moveData[dir];
-      // Only groups the plan actually touched. The cohesion penalty steers the scrambler away
-      // from clan squads, so an untouched virtual squad is the common case — listing every one
-      // of them in full would bury the handful of players that do move.
+      // Only groups the plan actually touched. Plenty of virtual squads stay put in any given
+      // scramble — listing every one of them in full would bury the handful that do move.
+      // (The cohesion penalty does not cause that: it scores splits, min(onT1, onT2) * 75, and
+      // is indifferent to a group moving as a whole.)
       const teamVirtual = virtualSquads
         .filter(vs => String(vs.teamID) === String(data.srcID))
         .map(vs => ({ vs, roster: [...vs.members, ...vs.pulled] }))
         .filter(({ roster }) => roster.some(id => moveByEos.has(id)));
 
+      // Divider between the two directions. Only when there is something above it (more than the
+      // balance projection) and something below, so it never trails the report or sits directly
+      // under the projection. Discord rejects an empty field value, hence the zero-width space.
+      // The name must stay free of ➔ — that is how the fields are told apart downstream.
+      // A report already cut short ends on its truncation notice; a rule below that would read as
+      // if more was coming.
+      const truncated = embed.fields[embed.fields.length - 1]?.name.includes('Truncated');
+      if (dir === '2to1' && embed.fields.length > 1 && !truncated &&
+          (teamVirtual.length > 0 || data.listedTotal > 0)) {
+        embed.fields.push({ name: '━'.repeat(28), value: '​', inline: false });
+      }
+
       if (teamVirtual.length > 0) {
         const lines = [];
         for (const { vs, roster } of teamVirtual) {
-          // "divided" is about the virtual squad itself ending up on two teams — the thing the
-          // grouping exists to prevent.
-          const divided = roster.some(id => !moveByEos.has(id));
-
+          for (const id of roster) listed.add(id);
+          // "moved together" is a statement, not a verdict: the scrambler swaps a virtual squad
+          // as one atom and nothing afterwards singles a member out, so a listed group always
+          // travels whole. scrambler-test-runner.js asserts that invariant against the real
+          // algorithm; there is deliberately no runtime branch for the torn-apart case.
+          //
+          // ⚓ marks the anchor only here, never in a player row: it is a double-width emoji in
+          // Discord's monospace block and would break the aligned columns. The rows already name
+          // each player's real squad, so the anchor is identifiable from the header alone.
+          const anchor = anchorLabelOf(vs);
+          if (anchor) anchorListed = true;
           if (lines.length) lines.push('');
-          lines.push(`Virtual Squad: [${vs.tag}] ${squadStats(roster)} (${divided ? 'divided!' : 'moved together'})`);
+          lines.push(`Virtual Squad: [${vs.tag}] ${anchor ? `⚓ ${anchor} · ` : ''}` +
+            `${squadStats(roster)} (moved together)`);
           lines.push(...this.buildPlayerRows(roster, playerByEos, eloMap, clanByEos, {
-            squadLabelOf,
-            movedOf: divided ? (id => (moveByEos.has(id) ? 'moved' : 'stay')) : null
+            squadLabelOf
           }));
         }
 
-        // Counts players who actually change team, same as the regular fields — a divided squad
-        // keeps its stayers visible but they are not part of the move. Per-squad roster sizes
-        // are in the block headers.
+        // Counts players who actually change team, same as the regular fields. Per-squad roster
+        // sizes are in the block headers.
         const movers = teamVirtual.reduce(
           (n, { roster }) => n + roster.filter(id => moveByEos.has(id)).length, 0);
 
@@ -410,6 +448,7 @@ export const DiscordHelpers = {
 
       const lines = [];
       for (const playerIDs of Object.values(data.squads)) {
+        for (const id of playerIDs) listed.add(id);
         if (lines.length) lines.push('');
         lines.push(`${squadLabelOf(playerIDs[0]).padEnd(16)} ${squadStats(playerIDs)}`);
         lines.push(...this.buildPlayerRows(playerIDs, playerByEos, eloMap, clanByEos));
@@ -421,13 +460,25 @@ export const DiscordHelpers = {
     }
 
     // Each entry appears only if its symbol actually made it into the report — no legend for
-    // markers nobody can see (a plan without ELO has no ★, one without clans has no ◆/◇).
-    const body = embed.fields.map(f => f.value).join('\n');
+    // markers nobody can see (a plan without ELO has no μ/Ø/★, one without clans no ◆/◇/⚓).
+    //
+    // Decided from the data, NOT by searching the rendered text for the symbol: player names,
+    // squad names and clan tags are all player-chosen, so a Nordic name like "BJØRN Håkonsen" or
+    // a squad called "MÖRSER Ø" would put a Ø in the body and conjure up an ELO legend on a
+    // report built without any ELO data at all.
+    const markers = [...listed].map(id => clanByEos.get(id)).filter(Boolean);
+    // squadStats renders `Np · Ø…μ · N★` on every block header, so with ELO data all three
+    // symbols are present whenever at least one block was rendered — including the `0★` that
+    // still needs explaining.
+    const withElo = !!eloMap && listed.size > 0;
     const legend = [
-      ['★', 'regular (10+ rounds)'],
-      ['◆', 'clan member (virtual squad)'],
-      ['◇', 'pulled with squad']
-    ].filter(([symbol]) => body.includes(symbol)).map(([symbol, text]) => `${symbol} ${text}`);
+      [withElo, 'μ', 'ELO rating'],
+      [withElo, 'Ø', 'squad average'],
+      [withElo, '★', 'regular (10+ rounds)'],
+      [markers.some(c => !c.pulled), '◆', 'clan member (virtual squad)'],
+      [markers.some(c => c.pulled), '◇', 'pulled with squad'],
+      [anchorListed, '⚓', 'anchor squad']
+    ].filter(([shown]) => shown).map(([, symbol, text]) => `${symbol} ${text}`);
 
     if (legend.length) embed.footer = { text: legend.join(' · ') };
 
@@ -443,11 +494,11 @@ export const DiscordHelpers = {
   // block because the only variable-width part (the name) sits last — player names routinely
   // contain Unicode that would otherwise wreck a right-aligned layout.
   //
-  // Optional columns, each only rendered where it carries information:
-  //   movedOf(eosID)     — 'moved'/'stay'; used for a virtual squad the plan tore apart
-  //   squadLabelOf(eosID) — the real in-game squad; a virtual squad spans several of them
+  // Optional column, only rendered where it carries information:
+  //   squadLabelOf(eosID) — the real in-game squad; a virtual squad spans several of them, and
+  //                         UNASSIGNED here means the player was folded in by their clan tag
   // The clan marker column appears whenever any listed player belongs to a virtual squad.
-  buildPlayerRows(eosIDs, playerByEos, eloMap, clanByEos, { movedOf = null, squadLabelOf = null } = {}) {
+  buildPlayerRows(eosIDs, playerByEos, eloMap, clanByEos, { squadLabelOf = null } = {}) {
     const showMarker = eosIDs.some(id => clanByEos.has(id));
 
     const rows = eosIDs.map(eosID => {
@@ -459,22 +510,17 @@ export const DiscordHelpers = {
         name: player ? player.name : `Unknown (${eosID.slice(0, 8)}...)`,
         mu: eloMap ? (rating ? rating.mu : 25.0) : null,
         isReg: !!rating && (rating.roundsPlayed || 0) >= 10,
-        marker: !clan ? ' ' : clan.pulled ? '◇' : '◆',
-        moved: movedOf ? movedOf(eosID) : null
+        marker: !clan ? ' ' : clan.pulled ? '◇' : '◆'
       };
     });
 
-    rows.sort((a, b) => {
-      if (movedOf && a.moved !== b.moved) return a.moved === 'moved' ? -1 : 1;
-      return eloMap ? b.mu - a.mu : 0;
-    });
+    rows.sort((a, b) => (eloMap ? b.mu - a.mu : 0));
 
     const fit = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
 
     return rows.map(r => {
       let line = '  ';
-      if (movedOf) line += `${r.moved.padEnd(5)}  `;
-      if (eloMap) line += `${r.mu.toFixed(1).padStart(4)}${r.isReg ? '★' : ' '}  `;
+      if (eloMap) line += `${r.mu.toFixed(1).padStart(4)}μ${r.isReg ? '★' : ' '}  `;
       if (showMarker) line += `${r.marker} `;
       if (squadLabelOf) line += `${fit(squadLabelOf(r.eosID), 9)} `;
       return line + r.name;
@@ -487,15 +533,15 @@ export const DiscordHelpers = {
   //
   // The per-field cap alone is not enough: Discord also rejects the entire message when title +
   // description + every field name and value + footer exceed 6000 characters, and a clan-heavy
-  // plan produces enough fields to get there (divided virtual squads list their stayers on top
-  // of the movers). So chunks are only pushed while the embed can still afford them, and what
-  // did not fit is reported — a shortened report beats a 400 that drops the report entirely.
+  // plan produces enough fields to get there. So chunks are only pushed while the embed can
+  // still afford them, and what did not fit is reported — a shortened report beats a 400 that
+  // drops the report entirely.
   pushChunkedFields(embed, lines, baseName, suffix = '') {
     const codeBlockWrapLen = 13; // ```text\n ... \n```
     const embedCharLimit = 6000;
-    // Room for the title, the description, the legend footer and the truncation notice itself —
-    // none of which are in embed.fields yet (or at all) while this runs.
-    const reserve = 320;
+    // Room for the title, the description, the legend footer, the direction divider and the
+    // truncation notice itself — none of which are in embed.fields yet (or at all) while this runs.
+    const reserve = 420;
     const used = () => embed.fields.reduce((n, f) => n + f.name.length + f.value.length, 0);
     const nameFor = (part) => (part === 1 ? (suffix ? `${baseName} ${suffix}` : baseName) : `${baseName} (Cont.)`);
 
diff --git a/utils/tb-scrambler.js b/utils/tb-scrambler.js
index a2069b0..c7bcb21 100644
--- a/utils/tb-scrambler.js
+++ b/utils/tb-scrambler.js
@@ -19,7 +19,7 @@
  *       minPlayersToMove, maxPlayersToMove })
  *       Returns an Array of { eosID, targetTeamID } move objects,
  *       with a calculationTime property attached to the array, plus a
- *       virtualSquads property ([{ teamID, tag, members, pulled }])
+ *       virtualSquads property ([{ teamID, tag, anchorId, members, pulled }])
  *       when clan grouping built at least one virtual squad.
  *
  * ─── DEPENDENCIES ────────────────────────────────────────────────
@@ -38,7 +38,7 @@
  * - Scoring penalties (lower = better):
  *     balanceScore        — Exponential penalty for team diff > 2.
  *     sizeDeviationPenalty — Penalty for significant underpopulation.
- *     eloBalancePenalty   — Composite score derived from a 50/50 weighted split between Mean ELO diff and Top-15 ELO diff (ELO mode only).
+ *     eloBalancePenalty   — Composite score derived from a 60/40 weighted split between Mean ELO diff and Top-15 ELO diff (ELO mode only).
  *     veteranPenalty      — Imbalanced regular player counts (ELO mode only).
  *     clanCohesionPenalty — Safety-net penalty for clan groups splitting across teams (serves as a guard against edge cases since squads are never decomposed).
  *     anchorPenalty       — Moving >2 large squads from one team (Heuristic mode only).
@@ -118,6 +118,9 @@ export const Scrambler = {
 
       const team1Count = team1Players.length;
       const team2Count = team2Players.length;
+      // Players the scrambler still treats as loose. Clan members folded into a virtual squad
+      // are given the anchor's squad identity and drop out of this count, so it can read lower
+      // than the server's own unassigned tally.
       const unassignedCount = workingPlayers.filter((p) => p.squadID === null).length;
       return { team1Count, team2Count, unassignedCount };
     };
@@ -156,10 +159,10 @@ export const Scrambler = {
     // Cross-team consolidation is intentionally NOT performed: clan
     // members already split across teams are treated as two independent
     // groups (per user spec).
-    // `${teamID}:${tag}` -> { teamID, tag, originalMembers: Set<eosID>, allMembers: Set<eosID> }
-    // allMembers is the full virtual squad roster (clan members plus anyone who travelled with
-    // them) and is filled in once the anchor is known; it surfaces in the returned plan so the
-    // Discord report can mark who moved as a clan and who was only pulled along.
+    // `${teamID}:${tag}` -> { teamID, tag, originalMembers: Set<eosID>, anchorId: string }
+    // originalMembers is every clan member on this team; it drives the cohesion penalty.
+    // The roster that surfaces in the returned plan is deliberately NOT cached here — it is read
+    // off the candidate lists at the end, after later clans have had their turn.
     const virtualSquadsByTag = new Map();
     if (clanGroups && Object.keys(clanGroups).length > 0) {
       // Largest clans first so big groups claim their preferred anchors.
@@ -231,6 +234,17 @@ export const Scrambler = {
             }
           }
 
+          // An unassigned player folded in by their clan tag is not loose any more — give them
+          // the anchor's squad identity so every `squadID === null` check downstream treats them
+          // like any other squad member. The cap-enforcement trim is the one that matters: it
+          // would otherwise pick them off individually and tear the clan apart.
+          // This is an internal marker (the candidate id, e.g. "T1-S5"), not a game squad ID, and
+          // workingPlayers is a local copy — it never reaches the caller.
+          for (const p of newPlayers) {
+            const wp = playerMap.get(p);
+            if (wp && wp.squadID === null) wp.squadID = anchor.id;
+          }
+
            const virtualSquad = {
              ...anchor,
              players: newPlayers,
@@ -239,9 +253,10 @@ export const Scrambler = {
              clanTag: tag
            };
 
-           // Full roster (clan members + anyone riding along in the anchor squad, or in every
-           // contributing squad when pullEntireSquads is on) for the Discord report.
-           virtualSquadsByTag.get(`${teamID}:${tag}`).allMembers = new Set(newPlayers);
+           // Remember the anchor so the Discord report can name the squad the group was built
+           // around. The roster is not cached — a clan processed after this one can still
+           // reclaim its own members out of this virtual squad.
+           virtualSquadsByTag.get(`${teamID}:${tag}`).anchorId = anchor.id;
 
            // Replace anchor in the candidate list with the virtual squad.
            const anchorIdx = teamCandidates.indexOf(anchor);
@@ -477,9 +492,10 @@ export const Scrambler = {
       }
 
       // ─── Clan Cohesion Penalty ──────────────────────────────────────
-      // Safety-net penalty for splitting a registered virtual clan group across teams.
-      // Squads are never decomposed, so this only triggers if clan members span multiple
-      // squad boundaries — a condition that shouldn't arise in normal operation.
+      // Safety net, and structurally always zero today: every same-team member of a clan is
+      // folded into that clan's virtual squad, the search moves that squad as one atom, so
+      // originalMembers can never land on two teams. Kept because the folding is the only
+      // thing holding that up — break it and this is what catches the fallout.
       if (virtualSquadsByTag.size > 0) {
         const movingToT2 = new Set(selectedT1Squads.flatMap((s) => s.players));
         const movingToT1 = new Set(selectedT2Squads.flatMap((s) => s.players));
@@ -639,7 +655,9 @@ export const Scrambler = {
     // ─── Cap Enforcement (Unassigned-only Trimming) ──────────────────
     // Trim over-cap teams using unassigned players only.
     // Squad members are never moved during trimming — overcap is tolerated
-    // rather than breaking any squad or friend group.
+    // rather than breaking any squad or friend group. Clan members folded into a
+    // virtual squad carry the anchor's squad identity by now, so they are covered
+    // by the same rule and never picked off individually.
     let team1Overcap = postInitialSwapCounts.team1Count - maxTeamSize;
     let team2Overcap = postInitialSwapCounts.team2Count - maxTeamSize;
 
@@ -672,7 +690,8 @@ export const Scrambler = {
       if (team1Overcap > 0 || team2Overcap > 0) {
         Logger.verbose('TeamBalancer', 1,
           `WARNING: Team(s) still over cap after trim (T1:+${team1Overcap}, T2:+${team2Overcap}). ` +
-          `No unassigned players left. Trimming would require splitting squads — tolerating overcap.`
+          `No loose unassigned players left. Trimming would require splitting a squad or a clan ` +
+          `group — tolerating overcap.`
         );
       }
     }
@@ -700,16 +719,32 @@ export const Scrambler = {
     // Only present when clan grouping actually built virtual squads, so consumers can treat
     // "property exists" as "the feature was used this round".
     if (virtualSquadsByTag.size > 0) {
-      // Both lists are derived from allMembers so their union is exactly the virtual squad's
-      // roster. originalMembers is deliberately NOT used as the source: it holds every clan
-      // member on the team, including those sitting in a squad an earlier clan already claimed
-      // as its anchor — those never joined this virtual squad and travel with the foreign clan.
-      result.virtualSquads = [...virtualSquadsByTag.values()].map((vs) => ({
-        teamID: vs.teamID,
-        tag: vs.tag,
-        members: [...vs.allMembers].filter((id) => vs.originalMembers.has(id)),
-        pulled: [...vs.allMembers].filter((id) => !vs.originalMembers.has(id))
-      }));
+      // Read the roster off the candidate lists rather than the allMembers snapshot taken when
+      // the group was built. A clan processed later can pull its own members back out of an
+      // earlier virtual squad, and only the candidate arrays carry that final state. Reporting
+      // the snapshot would list players who travelled with a different group — inflating the
+      // block's stats and showing movers that belong somewhere else.
+      // Clan groups are disjoint, so what a later clan reclaims is always a `pulled` rider,
+      // never one of this group's own members.
+      const finalRosterOf = (vs) =>
+        (vs.teamID === '1' ? t1Candidates : t2Candidates)
+          .find((s) => s.isVirtual && s.clanTag === vs.tag)?.players;
+
+      result.virtualSquads = [...virtualSquadsByTag.values()]
+        .map((vs) => {
+          // Gone entirely: every player was reclaimed by other clans, so there is no unit left
+          // to report.
+          const roster = finalRosterOf(vs);
+          if (!roster || roster.length === 0) return null;
+          return {
+            teamID: vs.teamID,
+            tag: vs.tag,
+            anchorId: vs.anchorId,
+            members: roster.filter((id) => vs.originalMembers.has(id)),
+            pulled: roster.filter((id) => !vs.originalMembers.has(id))
+          };
+        })
+        .filter(Boolean);
     }
     return result; // Return the plan to the TeamBalancer
   }
~~~~
