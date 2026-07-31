import TeamBalancer from '../plugins/team-balancer.js';
import Logger from '../../core/logger.js'; // The plugin uses this, so we need a mock.

// Suppress logger output for cleaner test results, but keep level-1 lines for assertions
// (the round report is logged at level 1 and is how we verify scrambleCondition).
const capturedLogs = [];
Logger.verbose = (module, level, message) => {
  if (level === 1) {
    capturedLogs.push(String(message));
    console.error(`[${module}] ERROR: ${message}`);
  }
};

console.log('🧪 Initializing Plugin Logic Test Harness...');

// 1. Environment Initialization (The "Harness")
const capturedBroadcasts = [];
const mockServer = {
  rcon: {
    broadcast: async (msg) => {
      capturedBroadcasts.push(msg);
    },
    execute: async (cmd) => {},
    warn: async (steamID, msg) => {},
    switchTeam: async (rconIdentifier, teamID) => {
      // Actually mutate the mock player so SwapExecutor's verification step sees the move succeed.
      const player = mockServer.players.find(
        (p) => p.steamID === rconIdentifier || p.name === rconIdentifier || p.eosID === rconIdentifier
      );
      if (player) player.teamID = Number(teamID);
    },
  },
  players: [], // empty for logic tests
  squads: [], // empty for logic tests
  admins: {}, // SquadJS admin list: { [steamID|eosID]: { permission: true } }
  currentLayer: null,
  // Mock listener methods to prevent errors
  removeListener: () => {},
  on: () => {},
  listenerCount: () => 0,
  emit: () => {}, // executeScramble() emits TEAM_BALANCER_SCRAMBLE_EXECUTED
  updatePlayerList: async () => {}, // SwapExecutor refreshes the player list to verify moves
};

const mockDbState = {
  winStreakTeam: null,
  winStreakCount: 0,
  lastSyncTimestamp: Date.now(),
  lastScrambleTime: null,
  scrambleOnRoundEndBy: null,
};

const mockModel = {
  sync: async () => {},
  findOrCreate: async () => {
    const instance = {
      ...mockDbState,
      save: async function () {
        mockDbState.winStreakTeam = this.winStreakTeam;
        mockDbState.winStreakCount = this.winStreakCount;
        mockDbState.lastSyncTimestamp = this.lastSyncTimestamp;
        mockDbState.lastScrambleTime = this.lastScrambleTime;
        mockDbState.scrambleOnRoundEndBy = this.scrambleOnRoundEndBy;
      },
    };
    return [instance, true];
  },
  findByPk: async () => {
    const instance = {
      ...mockDbState,
      save: async function () {
        mockDbState.winStreakTeam = this.winStreakTeam;
        mockDbState.winStreakCount = this.winStreakCount;
        mockDbState.lastSyncTimestamp = this.lastSyncTimestamp;
        mockDbState.lastScrambleTime = this.lastScrambleTime;
        mockDbState.scrambleOnRoundEndBy = this.scrambleOnRoundEndBy;
      },
    };
    return instance;
  },
};

const mockConnectors = {
  // Mock the database connector to prevent file system access and errors
  sqlite: {
    define: () => mockModel,
    transaction: async (fn) => {
      // Execute the callback immediately with a dummy transaction object
      return fn({
        commit: async () => {},
        rollback: async () => {},
        LOCK: { UPDATE: 'UPDATE' },
      });
    },
    query: async () => [], // tb-database initDB issues PRAGMA journal_mode=WAL etc.
  },
};

const defaultTestOptions = {
  database: 'sqlite',
  enableWinStreakTracking: true,
  maxWinStreak: 2,
  enableSingleRoundScramble: false,
  singleRoundScrambleThreshold: 500,
  minTicketsToCountAsDominantWin: 300,
  invasionAttackTeamThreshold: 300,
  invasionDefenceTeamThreshold: 650,
  scrambleAnnouncementDelay: 10,
  scramblePercentage: 0.5,
  showWinStreakMessages: true,
  debugLogs: false,
  devMode: true, // To simplify command handling if needed
  useGenericTeamNamesInBroadcasts: true, // For predictable broadcast messages
  changeTeamRetryInterval: 150,
  maxScrambleCompletionTime: 5000,
  warnOnSwap: false,
  discordClient: null,
  discordAdminChannelID: null,
  discordReportChannelID: null,
  discordAdminRoleIDs: [],
};

// Helper for asserting test conditions
let testCount = 0;
let passCount = 0;
function assert(condition, message) {
  testCount++;
  if (condition) {
    passCount++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    console.log(`  ❌ FAIL: ${message}`);
  }
}

async function runPluginLogicTests() {
  console.log('\n🚀 Starting Plugin Logic Tests...');

  // Instantiate the plugin with our mock environment
  const tb = new TeamBalancer(mockServer, { ...defaultTestOptions }, mockConnectors);

  // Mock RconMessages and formatMessage as BasePlugin loading is bypassed/incomplete in test harness
  tb.RconMessages = {
    prefix: '[TB]',
    executeScrambleMessage: 'Scrambling teams!',
    executeDryRunMessage: 'Dry run scramble!',
    scrambleCompleteMessage: 'Scramble complete.',
    scrambleFailedMessage: 'Scramble failed.',
    manualScrambleAnnouncement: 'Manual scramble in {delay}s',
    immediateManualScramble: 'Scrambling now!',
    scrambleAnnouncement: 'Scramble in {delay}s after {count} dominant wins',
    singleRoundScramble: 'Single round scramble triggered.',
    matchEndScrambleAnnouncement: 'Match-end scramble in {delay}s',
    seedScrambleAnnouncement: 'Seed scramble in {delay}s',
    system: { trackingEnabled: 'Tracking enabled', trackingDisabled: 'Tracking disabled' },
    dominant: { stomped: 'Stomp', steamrolled: 'Steamrolled', invasionAttackStomp: 'Atk Stomp', invasionDefendStomp: 'Def Stomp' },
    nonDominant: { streakBroken: 'Streak Broken', invasionAttackWin: 'Atk Win', invasionDefendWin: 'Def Win', narrowVictory: 'Narrow', marginalVictory: 'Marginal', tacticalAdvantage: 'Tactical', operationalSuperiority: 'Operational' }
  };
  tb.formatMessage = (msg, params) => {
    if (!msg) return '';
    return Object.entries(params).reduce((acc, [k, v]) => acc.replace(`{${k}}`, v), msg);
  };

  // Manually mount to initialize DB stubs etc.
  await tb.mount();

  // --- Phase 3.1: Layer & Mode Detection ---
  console.log('\n[Phase 3.1: Layer & Mode Detection]');
  // The plugin uses `gameModeCached`. We will set it directly for predictable testing.
  tb.gameModeCached = 'RAAS';
  assert(tb.gameModeCached.includes('RAAS'), 'Game mode is correctly set to Standard (RAAS)');
  tb.gameModeCached = 'Invasion';
  assert(tb.gameModeCached.includes('Invasion'), 'Game mode is correctly set to Invasion');

  // --- Phase 3.2: The "Dominant Win" Matrix ---
  console.log('\n[Phase 3.2: The "Dominant Win" Matrix]');

  // Standard (Threshold 300): Win -> True
  await tb.resetStreak();
  tb.gameModeCached = 'RAAS';
  await tb.onRoundEnded({ winner: { team: 1, tickets: 301 }, loser: { tickets: 0 } });
  assert(tb.winStreakCount === 1, 'Standard Dominant Win (301 tickets) correctly increments streak.');

  // Standard (Threshold 300): Loss -> False
  await tb.resetStreak();
  tb.gameModeCached = 'RAAS';
  await tb.onRoundEnded({ winner: { team: 1, tickets: 150 }, loser: { tickets: 0 } });
  assert(tb.winStreakCount === 0, 'Standard Non-Dominant Win (150 tickets) does NOT increment streak.');

  // Invasion Attacker (Threshold 300): Win -> True
  await tb.resetStreak();
  tb.gameModeCached = 'Invasion';
  await tb.onRoundEnded({ winner: { team: 1, tickets: 350 }, loser: { tickets: 0 } });
  assert(tb.winStreakCount === 1, 'Invasion Attacker Dominant Win (350 tickets) correctly increments streak.');

  // Invasion Defender (Threshold 650): Loss -> False
  await tb.resetStreak();
  tb.gameModeCached = 'Invasion';
  await tb.onRoundEnded({ winner: { team: 2, tickets: 500 }, loser: { tickets: 0 } });
  assert(tb.winStreakCount === 0, 'Invasion Defender Non-Dominant Win (500 tickets) does NOT increment streak.');

  // Invasion Defender (Threshold 650): Win -> True
  await tb.resetStreak();
  tb.gameModeCached = 'Invasion';
  await tb.onRoundEnded({ winner: { team: 2, tickets: 700 }, loser: { tickets: 0 } });
  assert(tb.winStreakCount === 1, 'Invasion Defender Dominant Win (700 tickets) correctly increments streak.');

  // --- Phase 3.3: Streak & Scramble Triggering ---
  console.log('\n[Phase 3.3: Streak & Scramble Triggering]');

  // Sequence 1: Two dominant wins trigger scramble
  await tb.resetStreak();
  tb.options.maxWinStreak = 2;
  tb.gameModeCached = 'RAAS';
  await tb.onRoundEnded({ winner: { team: 1, tickets: 400 }, loser: { tickets: 0 } });
  assert(tb.winStreakCount === 1, 'Sequence 1.1: First dominant win sets streak to 1.');
  assert(tb._scramblePending === false, 'Sequence 1.1: Scramble is NOT pending after first win.');

  await tb.onRoundEnded({ winner: { team: 1, tickets: 400 }, loser: { tickets: 0 } });
  assert(tb.winStreakCount === 2, 'Sequence 1.2: Second dominant win sets streak to 2.');
  assert(tb._scramblePending === true, 'Sequence 1.2: Scramble IS pending after second win.');
  await tb.cancelPendingScramble(null, null, true); // Clean up for next test

  // Sequence 2: Streak Breaker
  await tb.resetStreak();
  tb.gameModeCached = 'RAAS';
  await tb.onRoundEnded({ winner: { team: 1, tickets: 400 }, loser: { tickets: 0 } });
  assert(tb.winStreakCount === 1, 'Sequence 2.1: First dominant win sets streak to 1.');

  await tb.onRoundEnded({ winner: { team: 2, tickets: 50 }, loser: { tickets: 0 } });
  assert(tb.winStreakCount === 0, 'Sequence 2.2: Non-dominant win by other team resets streak to 0.');

  // Sequence 3: Single Round Trigger
  await tb.resetStreak();
  tb.options.enableSingleRoundScramble = true;
  tb.options.singleRoundScrambleThreshold = 500;
  tb.gameModeCached = 'RAAS';
  await tb.onRoundEnded({ winner: { team: 1, tickets: 600 }, loser: { tickets: 99 } }); // Margin 501
  assert(tb._scramblePending === true, 'Sequence 3: Single round scramble is triggered by massive ticket margin.');
  await tb.cancelPendingScramble(null, null, true); // Clean up
  tb.options.enableSingleRoundScramble = false; // Reset option

  // --- Phase 3.4: Announcement & Post-Scramble Reset ---
  console.log('\n[Phase 3.4: Announcement & Post-Scramble Reset]');

  // Test scramble announcement
  await tb.resetStreak();
  capturedBroadcasts.length = 0; // Clear broadcast history
  tb.options.maxWinStreak = 1;
  await tb.onRoundEnded({ winner: { team: 1, tickets: 400 }, loser: { tickets: 0 } });
  const announcement = capturedBroadcasts.find((msg) => msg.includes('Scramble in'));
  assert(!!announcement, 'Scramble announcement broadcast was captured.');
  if (announcement) {
    assert(announcement.includes('1 dominant wins'), 'Announcement includes correct win count.');
  }

  // Test post-scramble reset
  // We can call executeScramble directly to test the reset logic.
  // Populate server with unbalanced teams to ensure scramble generates moves and triggers the success path.
  // Note: transformSquadJSData filters out players without eosID, so each mock player needs one.
  // Also need players on BOTH teams (heavily imbalanced) so the scrambler has somewhere to swap to.
  tb.server.players = [
    ...Array.from({ length: 9 }, (_, i) => ({
      eosID: `mock_eos_t1_${i}`,
      steamID: `765611980000000${i}`,
      name: `T1Player${i}`,
      teamID: 1,
      squadID: null,
      roles: ['Rifleman']
    })),
    {
      eosID: 'mock_eos_t2_0',
      steamID: '76561198000000099',
      name: 'T2Player0',
      teamID: 2,
      squadID: null,
      roles: ['Rifleman']
    }
  ];

  await tb.executeScramble(false); // isSimulated = false
  assert(tb.winStreakCount === 0, 'executeScramble resets the win streak count to 0.');
  assert(tb._scrambleInProgress === false, 'Scramble is no longer in progress after execution.');

  // --- Phase 3.5: !scramble matchend (deferred round-end scramble) ---
  console.log('\n[Phase 3.5: !scramble matchend]');

  // Armed flag is consumed at round end and initiates the (countdown) scramble + announcement.
  await tb.resetStreak();
  tb.manuallyDisabled = false;
  tb.options.enableWinStreakTracking = true;
  tb.gameModeCached = 'RAAS';
  capturedBroadcasts.length = 0;
  tb._scrambleOnRoundEnd = true;
  await tb.onRoundEnded({ winner: { team: 1, tickets: 50 }, loser: { tickets: 0 } }); // non-dominant: no auto-scramble
  assert(tb._scrambleOnRoundEnd === false, 'matchend: armed flag is consumed at round end.');
  assert(tb._scramblePending === true, 'matchend: a scramble is initiated at round end.');
  assert(!!capturedBroadcasts.find((m) => m.includes('Match-end scramble in')), 'matchend: round-end announcement is broadcast.');
  await tb.cancelPendingScramble(null, null, true);

  // Fires even when win-streak tracking is disabled (it's an explicit admin command).
  await tb.resetStreak();
  tb.manuallyDisabled = true;
  tb._scrambleOnRoundEnd = true;
  await tb.onRoundEnded({ winner: { team: 1, tickets: 400 }, loser: { tickets: 0 } });
  assert(tb._scramblePending === true, 'matchend: fires at round end even when tracking is disabled.');
  await tb.cancelPendingScramble(null, null, true);
  tb.manuallyDisabled = false;

  // If another scramble is already pending at round end, matchend must not double up (and not announce).
  tb._scrambleOnRoundEnd = true;
  tb._scramblePending = true;
  capturedBroadcasts.length = 0;
  await tb.onRoundEnded({ winner: { team: 1, tickets: 50 }, loser: { tickets: 0 } });
  assert(tb._scrambleOnRoundEnd === false, 'matchend: flag consumed even when another scramble is pending.');
  assert(!capturedBroadcasts.find((m) => m.includes('Match-end scramble in')), 'matchend: no announcement when another scramble is already pending.');
  tb._scramblePending = false;

  // Command layer: arm via "!scramble matchend", then abort via "!scramble cancel".
  // requireScrambleConfirmation defaults to true and would divert the command into the confirmation gate.
  tb.options.requireScrambleConfirmation = false;
  tb._scrambleOnRoundEnd = false;
  await tb.onScrambleCommand({ message: 'matchend', chat: 'ChatAdmin', steamID: 'admin1', player: { name: 'Admin', steamID: 'admin1' } });
  assert(tb._scrambleOnRoundEnd === true, 'matchend: command arms the round-end flag.');
  // Survives a restart: the arm is persisted to the DB and reads back parsed (what mount() restores).
  assert(typeof mockDbState.scrambleOnRoundEndBy === 'string' && mockDbState.scrambleOnRoundEndBy.includes('admin1'), 'matchend: armed state is persisted to the DB.');
  const reloadedArm = tb.db._parseArm(mockDbState.scrambleOnRoundEndBy);
  assert(reloadedArm && reloadedArm.steamID === 'admin1', 'matchend: persisted arm reads back on reload (survives restart).');
  await tb.onScrambleCommand({ message: 'cancel', chat: 'ChatAdmin', steamID: 'admin1', player: { name: 'Admin', steamID: 'admin1' } });
  assert(tb._scrambleOnRoundEnd === false, 'matchend: "!scramble cancel" clears the armed flag.');
  assert(mockDbState.scrambleOnRoundEndBy === null, 'matchend: cancel clears the persisted arm too.');

  // "matchend" must not combine with "now"/"dry" (dry would bypass the confirmation gate and arm a live scramble).
  await tb.onScrambleCommand({ message: 'matchend dry', chat: 'ChatAdmin', steamID: 'admin1', player: { name: 'Admin', steamID: 'admin1' } });
  assert(tb._scrambleOnRoundEnd === false, 'matchend: "matchend dry" combo is rejected, nothing armed.');

  // A dry run must NOT disarm a scheduled end-of-round scramble.
  tb._scrambleOnRoundEnd = true;
  await tb.onScrambleCommand({ message: 'dry', chat: 'ChatAdmin', steamID: 'admin1', player: { name: 'Admin', steamID: 'admin1' } });
  assert(tb._scrambleOnRoundEnd === true, 'matchend: a dry run does not disarm the scheduled scramble.');
  tb._scrambleOnRoundEnd = false;
  tb.options.requireScrambleConfirmation = true; // restore default

  // A typo'd argument must be rejected outright. It used to fall through to the bare-"!scramble" path,
  // overwrite the pending "matchend" confirmation, and turn the next "confirm" into a LIVE mid-round scramble.
  const admin = { message: '', chat: 'ChatAdmin', steamID: 'admin1', player: { name: 'Admin', steamID: 'admin1' } };
  tb.scrambleConfirmation = null;
  tb._scramblePending = false;
  capturedBroadcasts.length = 0;
  await tb.onScrambleCommand({ ...admin, message: 'matchend' });
  const typoReply = await tb.onScrambleCommand({ ...admin, message: 'confiirm' });
  assert(/Unknown argument/.test(typoReply || ''), 'typo: "confiirm" is rejected as an unknown argument.');
  assert(!!tb.scrambleConfirmation?.args?.includes('matchend'), 'typo: the pending matchend confirmation survives the typo.');
  await tb.onScrambleCommand({ ...admin, message: 'confirm' });
  assert(tb._scrambleOnRoundEnd === true, 'typo: "confirm" after a typo still arms the END-OF-ROUND scramble.');
  assert(tb._scramblePending === false, 'typo: no live mid-round scramble is started.');
  assert(capturedBroadcasts.length === 0, 'typo: nothing is broadcast to players (arming is silent, no countdown announcement).');
  await tb.onScrambleCommand({ ...admin, message: 'cancel' });

  // Match-identity gate: an arm carried across a restart into a LATER round is discarded (not fired),
  // and that round is still evaluated normally by the win-streak path (fall-through).
  await tb.resetStreak();
  tb.manuallyDisabled = false;
  tb.options.enableWinStreakTracking = true;
  tb.gameModeCached = 'RAAS';
  tb._scramblePending = false;
  capturedBroadcasts.length = 0;
  mockServer.matchStartTime = new Date(2000000); // this round (round B) started here
  tb._scrambleOnRoundEnd = true;
  tb._scrambleOnRoundEndBy = { steamID: 'admin1', name: 'Admin', matchStartTime: 1000000 }; // armed in round A
  await tb.onRoundEnded({ winner: { team: 1, tickets: 400 }, loser: { tickets: 0 } }); // dominant win in round B
  assert(tb._scrambleOnRoundEnd === false, 'matchend: an arm from a previous round (restart across a boundary) is discarded.');
  assert(!capturedBroadcasts.find((m) => m.includes('Match-end scramble in')), 'matchend: a stale cross-round arm does NOT scramble the wrong round.');
  assert(tb.winStreakCount === 1, 'matchend: after discarding a stale arm, the round is still evaluated normally (streak incremented).');

  // Restart WITHIN the same round: server.matchStartTime is recomputed as Date.now()-PLAYTIME (integer
  // seconds) on every poll, so it jitters by <1s across polls. The current value differs slightly from
  // the stamp but stays within tolerance → the arm must STILL fire (regression guard against strict-eq).
  await tb.resetStreak();
  tb._scramblePending = false;
  capturedBroadcasts.length = 0;
  mockServer.matchStartTime = new Date(3000450); // ~450ms intra-round jitter vs the stamp below
  tb._scrambleOnRoundEnd = true;
  tb._scrambleOnRoundEndBy = { steamID: 'admin1', name: 'Admin', matchStartTime: 3000000 }; // same round
  await tb.onRoundEnded({ winner: { team: 1, tickets: 50 }, loser: { tickets: 0 } });
  assert(tb._scramblePending === true, 'matchend: an arm still fires when the round start is within jitter tolerance (restart within the same round).');
  assert(!!capturedBroadcasts.find((m) => m.includes('Match-end scramble in')), 'matchend: within-tolerance arm broadcasts the round-end announcement.');
  await tb.cancelPendingScramble(null, null, true);

  // Arming stamps the current round's start time onto the arm (and persists it).
  tb.options.requireScrambleConfirmation = false;
  mockServer.matchStartTime = new Date(4000000);
  tb._scrambleOnRoundEnd = false;
  await tb.onScrambleCommand({ message: 'matchend', chat: 'ChatAdmin', steamID: 'admin1', player: { name: 'Admin', steamID: 'admin1' } });
  assert(tb._scrambleOnRoundEndBy?.matchStartTime === 4000000, 'matchend: arming stamps the round start time onto the arm.');
  assert(tb.db._parseArm(mockDbState.scrambleOnRoundEndBy)?.matchStartTime === 4000000, 'matchend: the round stamp is persisted to the DB.');
  await tb.onScrambleCommand({ message: 'cancel', chat: 'ChatAdmin', steamID: 'admin1', player: { name: 'Admin', steamID: 'admin1' } });
  tb.options.requireScrambleConfirmation = true;
  delete mockServer.matchStartTime;

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

  // Two triggers meeting in one round end must report ONCE. A suppressed trigger falls through
  // instead of returning, so consecutive-wins and win-streak can both suppress on the same round;
  // only the first may set the report condition (and with it, send the single Discord notice).
  tb.options.maxWinStreak = 2;
  tb.options.maxConsecutiveWinsWithoutThreshold = 2;
  adminOnline();
  await tb.resetStreak();
  tb._scramblePending = false;
  await tb.onRoundEnded({ winner: { team: 1, tickets: 400 }, loser: { tickets: 0 } });
  capturedLogs.length = 0;
  await tb.onRoundEnded({ winner: { team: 1, tickets: 400 }, loser: { tickets: 0 } });
  assert(tb.consecutiveWinsCount === 2 && tb.winStreakCount === 2, 'gate: both triggers are met on the same round end.');
  assert(!!capturedLogs.find((m) => m.includes('Condition: Suppressed (Admin Online): Consecutive Wins')), 'gate: two suppressed triggers in one round report only the first.');
  tb.options.maxConsecutiveWinsWithoutThreshold = 0;
  tb.options.maxWinStreak = 1;

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
  // Pre-existing seed-path behaviour: initiateScramble() is fired without await and the following
  // resetStreak() clears _scramblePending (team-balancer.js:1851) while the countdown stays armed.
  // So the armed countdown — not the pending flag — is the observable for "seed scramble started".
  assert(!!tb._scrambleCountdownTimeout, 'gate: the seed auto-scramble is exempt and still fires with an admin online.');
  assert(!!capturedBroadcasts.find((m) => m.includes('Seed scramble in')), 'gate: the seed announcement is still broadcast with an admin online.');
  // cancelPendingScramble() bails when _scramblePending is false (team-balancer.js:2208), so it
  // cannot clear this countdown — drop it directly or it fires during a later test.
  clearTimeout(tb._scrambleCountdownTimeout);
  tb._scrambleCountdownTimeout = null;
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

  // Restore harness state for anything appended after this phase.
  tb.options.skipAutoScrambleWhenAdminOnline = false;
  mockServer.players = savedPlayers;
  mockServer.admins = {};

  // --- Final Report ---
  console.log(`\n🏁 All logic tests completed. Result: ${passCount}/${testCount} passed.`);
  if (passCount !== testCount) {
    console.error('⚠️ Some logic tests failed. Please review the output.');
  }
}

runPluginLogicTests().catch(console.error);