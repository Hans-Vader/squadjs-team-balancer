/**
 * THROWAWAY — visual test harness for the Discord scramble reporting.
 *
 * Posts fake scramble embeds into the admin channel so the layout can be eyeballed
 * without a populated server:
 *
 *   !teambalancer faketest            — all scenarios
 *   !teambalancer faketest dry        — one scenario by key
 *
 * Delete this file and the `faketest` case in plugins/team-balancer.js when done.
 */
import { DiscordHelpers } from './tb-discord-helpers.js';

const NAMES = [
  'Sparrow', 'Kovacs', 'Halloway', 'Bennett', 'Ridley', 'Vasquez', 'Okonkwo',
  'Lindqvist', 'Duarte', 'McHale', 'Novak', 'Brandt', 'Ferrari', 'Sokolov',
  'Nakamura', 'Weiss', 'Oyelaran', 'Petrov', 'Kaminski', 'Delacroix',
  'Ashworth', 'Bergström', 'Tanaka', 'Marchetti', 'Ivanov', 'Schulz',
  'Rivera', 'Nyström', 'Kowalczyk', 'Ó Súilleabháin', 'Þorsteinn', 'Białek'
];
const SQUAD_NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'];

// squadKey -> [tag, howManyMembersWearIt]. The rest of the squad gets "pulled along".
const CLAN_SQUADS = { '1-1': ['3DP', 7], '1-3': ['BSB', 4], '2-2': ['VETS', 5] };

const SQUAD_SIZE = 7;
const UNASSIGNED_PER_TEAM = 3;

function buildServer() {
  const players = [];
  const squads = [];
  let n = 0;

  for (const teamID of ['1', '2']) {
    for (let s = 0; s < SQUAD_NAMES.length; s++) {
      const squadID = String(s + 1);
      squads.push({ squadID, teamID, squadName: SQUAD_NAMES[s] });

      const [tag, tagged] = CLAN_SQUADS[`${teamID}-${squadID}`] || [null, 0];
      for (let i = 0; i < SQUAD_SIZE; i++) {
        const base = NAMES[n % NAMES.length];
        const name = tag && i < tagged ? `[${tag}] ${base}` : base;
        players.push({ eosID: `e${n}`, steamID: `7656${n}`, name, teamID, squadID });
        n++;
      }
    }
    for (let i = 0; i < UNASSIGNED_PER_TEAM; i++) {
      players.push({ eosID: `e${n}`, steamID: `7656${n}`, name: NAMES[n % NAMES.length], teamID, squadID: null });
      n++;
    }
  }

  return { players, squads };
}

const { players: PLAYERS, squads: SQUADS } = buildServer();

const inSquad = (teamID, squadID) => PLAYERS.filter((p) => p.teamID === teamID && p.squadID === squadID);
const unassigned = (teamID) => PLAYERS.filter((p) => p.teamID === teamID && p.squadID === null);

// Spread of skill levels so the ELO columns and the ★ regular marker both show up.
const ELO = new Map(
  PLAYERS.map((p, i) => [p.eosID, { mu: 18 + ((i * 7) % 45) * 0.42, roundsPlayed: (i * 13) % 34 }])
);

const FAKE_TB = {
  server: { players: PLAYERS, squads: SQUADS },
  getTeamName: (id) => (String(id) === '1' ? 'US Army' : 'Russian Ground Forces')
};

const plan = (movers, extras = {}) => {
  const p = movers.map((m) => ({ eosID: m.eosID, targetTeamID: m.teamID === '1' ? '2' : '1' }));
  p.calculationTime = 187;
  return Object.assign(p, extras);
};

const virtualSquadFor = (teamID, squadID) => {
  const [tag, tagged] = CLAN_SQUADS[`${teamID}-${squadID}`];
  const squad = inSquad(teamID, squadID);
  return {
    teamID,
    tag,
    members: squad.slice(0, tagged).map((p) => p.eosID),
    pulled: squad.slice(tagged).map((p) => p.eosID)
  };
};

// The main plan: three clan squads move as blocks, plus loose players to keep the counts even.
const CLAN_MOVERS = [...inSquad('1', '1'), ...inSquad('1', '3'), ...inSquad('2', '2')];
const LOOSE_MOVERS = [
  ...inSquad('2', '4').slice(0, 4),
  ...unassigned('2'),
  ...inSquad('1', '5').slice(0, 2),
  ...unassigned('1').slice(0, 1)
];
const FULL_PLAN = () =>
  plan([...CLAN_MOVERS, ...LOOSE_MOVERS], {
    virtualSquads: [virtualSquadFor('1', '1'), virtualSquadFor('1', '3'), virtualSquadFor('2', '2')]
  });

// 40 squadless movers under a single UNASSIGNED key — forces the 1024-char field chunking.
const CROWD = Array.from({ length: 40 }, (_, i) => ({
  eosID: `x${i}`,
  steamID: `9999${i}`,
  name: `UnassignedPlayerWithALongName${i}`,
  teamID: '1',
  squadID: null
}));
const CROWD_TB = {
  server: { players: [...PLAYERS, ...CROWD], squads: SQUADS },
  getTeamName: FAKE_TB.getTeamName
};
const CROWD_ELO = new Map([...ELO, ...CROWD.map((p, i) => [p.eosID, { mu: 20 + i * 0.5, roundsPlayed: i }])]);

const SCENARIOS = [
  {
    key: 'dry',
    label: 'Dry run · ELO · clan grouping (3 virtual squads, one with pulled players)',
    build: () => DiscordHelpers.createScrambleDetailsMessage(FULL_PLAN(), true, FAKE_TB, ELO)
  },
  {
    key: 'live',
    label: 'Live scramble plan · ELO · clan grouping',
    build: () => DiscordHelpers.createScrambleDetailsMessage(FULL_PLAN(), false, FAKE_TB, ELO)
  },
  {
    key: 'noelo',
    label: 'Live plan · no ELO tracker · no clan grouping',
    build: () =>
      DiscordHelpers.createScrambleDetailsMessage(plan([...CLAN_MOVERS, ...LOOSE_MOVERS]), false, FAKE_TB, null)
  },
  {
    key: 'split',
    label: 'Clan split across teams + a clan that was not moved at all',
    build: () =>
      DiscordHelpers.createScrambleDetailsMessage(
        plan(inSquad('1', '1').slice(0, 2), {
          virtualSquads: [virtualSquadFor('1', '1'), virtualSquadFor('2', '2')]
        }),
        false,
        FAKE_TB,
        ELO
      )
  },
  {
    key: 'empty',
    label: 'No valid moves found (low population)',
    build: () => DiscordHelpers.createScrambleDetailsMessage(plan([]), true, FAKE_TB, ELO)
  },
  {
    key: 'big',
    label: '40 unassigned movers — field chunking across multiple embed fields',
    build: () =>
      DiscordHelpers.createScrambleDetailsMessage(plan(CROWD), false, CROWD_TB, CROWD_ELO)
  },
  {
    key: 'streak',
    label: 'Win streak: dominant win, threshold reached',
    build: () => DiscordHelpers.buildWinStreakEmbed('US Army', 1, 2, 2, 412, true)
  },
  {
    key: 'triggered',
    label: 'Scramble triggered announcement',
    build: () => DiscordHelpers.buildScrambleTriggeredEmbed('2 dominant wins', 'US Army', 2, 30)
  },
  {
    key: 'completed',
    label: 'Scramble completed with partial failures',
    build: () => DiscordHelpers.buildScrambleCompletedEmbed(28, 25, 2, 1, 4310)
  },
  {
    key: 'failed',
    label: 'Scramble failed',
    build: () => DiscordHelpers.buildScrambleFailedEmbed('No valid solution within tolerance', 2140, FAKE_TB)
  }
];

export async function runFakeReport(channel, key) {
  const selected = key ? SCENARIOS.filter((s) => s.key === key.toLowerCase()) : SCENARIOS;

  if (selected.length === 0) {
    await channel.send(`⚠️ Unknown scenario \`${key}\`. Available: ${SCENARIOS.map((s) => `\`${s.key}\``).join(', ')}`);
    return;
  }

  for (const scenario of selected) {
    const embed = await scenario.build();
    await DiscordHelpers.sendDiscordMessage(channel, {
      content: `**[fake ${scenario.key}]** ${scenario.label}`,
      embeds: [embed]
    });
    await new Promise((r) => setTimeout(r, 400)); // ponytail: fixed spacing, sendDiscordMessage retries on 429 anyway
  }
}
