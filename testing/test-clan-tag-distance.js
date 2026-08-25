/**
 * Regression test: clan tag merging counts differing characters only, and
 * `minTagLength` keeps stub prefixes out of the grouping entirely.
 *
 * Tags of the same length merge within `maxEditDistance`; tags of different
 * length never merge, whatever the threshold. Wired into
 * `scrambler-test-runner.js`; no server and no mock data needed.
 */
import assert from 'node:assert/strict';
import { extractClanGroups, hammingDistance } from '../utils/tb-clan-grouping.js';

export function runClanTagDistanceTest() {
  console.log('\n--------------------------------------------------');
  console.log('🧪 TEST: Clan tag distance — substitutions only');

  try {
    assert.equal(hammingDistance('GTR', 'GTR'), 0);
    assert.equal(hammingDistance('GTR', 'GTA'), 1);
    assert.equal(hammingDistance('GTR', 'TR'), Infinity);
    assert.equal(hammingDistance('7-CAV', '7-CV'), Infinity);
    assert.equal(hammingDistance('♣ΛCE', '♣ΛC€'), 1);

    // Astral glyphs count as one character, not as two UTF-16 units, so a
    // plain `.length` gate would wrongly report Infinity for this pair.
    assert.equal(hammingDistance('🐙AB', 'xAB'), 1);
    assert.equal(hammingDistance('🐙AB', '🐙AC'), 1);

    // Length is a hard gate, so the client's Unicode form must not decide it:
    // precomposed é (1 code point) vs decomposed e + U+0301 (2).
    assert.equal(hammingDistance('Caf\u00E9', 'Cafe\u0301'), 0);
    assert.equal(hammingDistance('Caf\u00E9', 'Cafe'), 1);

    const players = [
      { eosID: '1', name: '[GTR] Spieler01' }, { eosID: '2', name: '[GTR] Spieler03' },
      { eosID: '3', name: 'TR Spieler02' },    { eosID: '4', name: 'TR Spieler04' },
      { eosID: '5', name: '[GTA] Mueller' },   { eosID: '6', name: '[GTA] Meier' }
    ];

    for (const caseSensitive of [true, false]) {
      const groups = extractClanGroups(players, { maxEditDistance: 1, caseSensitive });
      assert.deepEqual(Object.keys(groups).sort(), ['GTR', 'TR'], `caseSensitive: ${caseSensitive}`);
      assert.equal(groups.GTR.length, 4); // [GTA] absorbed into [GTR]
      assert.equal(groups.TR.length, 2);  // [TR] is a clan of its own
    }

    // minTagLength: a 1-char prefix is not a clan tag. Without it, [A|B] and
    // [C|D] both truncate to one character and merge at maxEditDistance 1.
    const stubs = [
      { eosID: '1', name: '[A|B] x' }, { eosID: '2', name: '[A|B] y' },
      { eosID: '3', name: '[C|D] z' }, { eosID: '4', name: '[C|D] w' }
    ];
    assert.deepEqual(extractClanGroups(stubs, { maxEditDistance: 1 }), {});
    assert.deepEqual(
      Object.keys(extractClanGroups(stubs, { maxEditDistance: 1, minTagLength: 1 })),
      ['A'] // opt back in and the old fusion of two unrelated clans returns
    );

    // The gate counts composed characters: a decomposed one-glyph prefix
    // (A + U+0301) must not pass minTagLength 2 as if it were two.
    const decomposed = [
      { eosID: '1', name: '[A\u0301|B] Hans' }, { eosID: '2', name: '[A\u0301|B] Peter' },
      { eosID: '3', name: '[O\u0308|C] Klaus' }, { eosID: '4', name: '[O\u0308|C] Uwe' }
    ];
    assert.deepEqual(extractClanGroups(decomposed, { maxEditDistance: 1 }), {});

    // Even at maxEditDistance 0, where no merge pass runs at all, one clan
    // sending mixed NFC/NFD forms stays one group.
    const mixed = [
      { eosID: '1', name: '[Caf\u00E9] a' }, { eosID: '2', name: '[Caf\u00E9] b' },
      { eosID: '3', name: '[Cafe\u0301] c' }
    ];
    assert.deepEqual(Object.values(extractClanGroups(mixed, { maxEditDistance: 0 })).map(g => g.length), [3]);
    // Raise the floor to 3 and the two-character clan [TR] drops out entirely.
    assert.deepEqual(
      Object.keys(extractClanGroups(players, { minTagLength: 3, maxEditDistance: 0 })).sort(),
      ['GTA', 'GTR']
    );

    console.log('   ✅ Same-length substitutions merge, length differences do not');
    console.log('   ✅ Prefixes shorter than minTagLength are not clan tags');
    return { pass: true, error: '' };
  } catch (err) {
    console.log(`   ❌ ${err.message}`);
    return { pass: false, error: err.message };
  }
}
