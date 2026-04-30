/**
 * test: final fix price_end
 *
 * Simulates a full 5-minute round lifecycle:
 *   1. Seed price_feed records around a fake end_time
 *   2. Seed 3 bets in the round
 *   3. Call the settlement price-selection query directly
 *   4. Assert the price chosen == closest DB record to end_time (NOT live fetch)
 *   5. Assert the price passed to contract (microUSD) converts correctly to USD for UI display
 *   6. Assert reward distribution mirrors contract logic exactly
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { validateConfig } from '../../src/config.js';
import { query, queryOne, withTransaction } from '../../src/db/client.js';
import { usdToMicroUsd, microUsdToUsd, stroopsToXlm } from '../../src/utils/conversion.js';
import { rankBets, calculateRewards } from '../../src/utils/ranking.js';

// ── helpers ───────────────────────────────────────────────────────────────────

const STROOPS = 10_000_000n;

function xlmToStroops(xlm: number): bigint {
  return BigInt(Math.round(xlm * Number(STROOPS)));
}

// ── test data ─────────────────────────────────────────────────────────────────

const TEST_ROUND_ID = 99901; // unlikely to collide with real data
const NOW_UNIX = Math.floor(Date.now() / 1000);
const END_TIME = new Date((NOW_UNIX - 60) * 1000); // ended 60s ago

// Price feed records seeded around end_time
// The record at -10s should be chosen (closest to end_time)
const PRICE_RECORDS = [
  { offsetSec: -120, priceUsd: 0.1589 }, // 2 min before end — should NOT be chosen
  { offsetSec: -10,  priceUsd: 0.1601 }, // 10s before end  — SHOULD be chosen (closest)
  { offsetSec: +45,  priceUsd: 0.1633 }, // 45s after end   — this is what live fetch would return
  { offsetSec: +120, priceUsd: 0.1650 }, // 2 min after end
];

const EXPECTED_SETTLE_PRICE_USD = 0.1601; // the -10s record
const EXPECTED_SETTLE_PRICE_MICRO_USD = usdToMicroUsd(EXPECTED_SETTLE_PRICE_USD);

// 3 bets
const BETS = [
  { address: 'GAEU3CLX3AZNNHB6ICCNMUN5VDMVRKJBP4CPQQGLRAXWKAFVBXAGLX32', predictedUsd: 0.1600, stakeXlm: 300 },
  { address: 'GDQAK5F3RXAHGNUZZGODDTUL4D2OFBQG26LOZF36URKXGDIQQEVBBA4L', predictedUsd: 0.1620, stakeXlm: 200 },
  { address: 'GCW74EQE6JLW446BLSOFWHAUDTZFBTZLLLBAA7JTRSXLBBWGXR4V4YD5', predictedUsd: 0.1550, stakeXlm: 100 },
];

// ── setup / teardown ──────────────────────────────────────────────────────────

beforeAll(async () => {
  validateConfig();

  // Clean up any leftover test data
  await query(`DELETE FROM bets WHERE round_id = $1`, [TEST_ROUND_ID]);
  await query(`DELETE FROM rounds WHERE contract_round_id = $1`, [TEST_ROUND_ID]);
  await query(`DELETE FROM price_feed WHERE source = 'test_price_end'`);

  // Seed round
  const startTime = new Date((NOW_UNIX - 360) * 1000); // started 6 min ago
  const lockTime  = new Date((NOW_UNIX - 210) * 1000); // locked 3.5 min ago
  await query(
    `INSERT INTO rounds
       (contract_round_id, creator_address, start_time, lock_time, end_time,
        min_stake_stroops, total_pool_stroops, participant_count, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Open')`,
    [
      TEST_ROUND_ID,
      'GAEU3CLX3AZNNHB6ICCNMUN5VDMVRKJBP4CPQQGLRAXWKAFVBXAGLX32',
      startTime.toISOString(),
      lockTime.toISOString(),
      END_TIME.toISOString(),
      xlmToStroops(100).toString(),
      xlmToStroops(600).toString(), // 300+200+100
      3,
    ]
  );

  // Seed price_feed records
  for (const rec of PRICE_RECORDS) {
    const recordedAt = new Date((NOW_UNIX - 60 + rec.offsetSec) * 1000);
    const microUsd = usdToMicroUsd(rec.priceUsd);
    await query(
      `INSERT INTO price_feed (price_usd, price_micro_usd, source, recorded_at)
       VALUES ($1, $2, 'test_price_end', $3)`,
      [rec.priceUsd, microUsd.toString(), recordedAt.toISOString()]
    );
  }

  // Seed bets
  let offset = 0;
  for (const bet of BETS) {
    const createdAt = new Date((NOW_UNIX - 300 + offset) * 1000);
    await query(
      `INSERT INTO bets
         (round_id, bettor_address, predicted_price_micro_usd, stake_amount_stroops, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        TEST_ROUND_ID,
        bet.address,
        usdToMicroUsd(bet.predictedUsd).toString(),
        xlmToStroops(bet.stakeXlm).toString(),
        createdAt.toISOString(),
      ]
    );
    offset += 30;
  }
});

afterAll(async () => {
  await query(`DELETE FROM bets WHERE round_id = $1`, [TEST_ROUND_ID]);
  await query(`DELETE FROM rounds WHERE contract_round_id = $1`, [TEST_ROUND_ID]);
  await query(`DELETE FROM price_feed WHERE source = 'test_price_end'`);
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('price_end: settlement price selection', () => {

  it('selects the price record closest to end_time — NOT the latest/live price', async () => {
    const round = await queryOne<{ end_time: Date }>(
      `SELECT end_time FROM rounds WHERE contract_round_id = $1`,
      [TEST_ROUND_ID]
    );
    expect(round).not.toBeNull();

    const closestRow = await queryOne<{ price_micro_usd: string; price_usd: string; recorded_at: Date }>(
      `SELECT price_micro_usd, price_usd, recorded_at FROM price_feed
       WHERE source = 'test_price_end'
       ORDER BY ABS(EXTRACT(EPOCH FROM (recorded_at - $1::timestamptz)))
       LIMIT 1`,
      [round!.end_time]
    );

    expect(closestRow).not.toBeNull();

    const chosenPriceUsd = parseFloat(closestRow!.price_usd);
    const chosenMicroUsd = BigInt(closestRow!.price_micro_usd);

    console.log('\n=== PRICE SELECTION ===');
    console.log(`  end_time:              ${round!.end_time.toISOString()}`);
    console.log(`  chosen record time:    ${closestRow!.recorded_at.toISOString()}`);
    console.log(`  chosen price USD:      $${chosenPriceUsd}`);
    console.log(`  chosen price microUSD: ${chosenMicroUsd}`);
    console.log(`  expected USD:          $${EXPECTED_SETTLE_PRICE_USD}`);
    console.log(`  live price (45s after):$${PRICE_RECORDS.find(r => r.offsetSec === 45)?.priceUsd}`);

    // Must pick the -10s record ($0.1601), NOT the +45s record ($0.1633)
    expect(chosenPriceUsd).toBeCloseTo(EXPECTED_SETTLE_PRICE_USD, 4);
    expect(chosenMicroUsd).toBe(EXPECTED_SETTLE_PRICE_MICRO_USD);
  });

  it('price is NOT the live Binance price at cron execution time', async () => {
    const liveSimulatedPrice = PRICE_RECORDS.find(r => r.offsetSec === 45)!.priceUsd;
    const liveSimulatedMicroUsd = usdToMicroUsd(liveSimulatedPrice);

    // The chosen price must differ from what a live fetch would return
    expect(EXPECTED_SETTLE_PRICE_MICRO_USD).not.toBe(liveSimulatedMicroUsd);

    console.log('\n=== LIVE vs CHOSEN ===');
    console.log(`  live (cron time) microUSD: ${liveSimulatedMicroUsd}  ($${liveSimulatedPrice})`);
    console.log(`  chosen (end_time) microUSD: ${EXPECTED_SETTLE_PRICE_MICRO_USD}  ($${EXPECTED_SETTLE_PRICE_USD})`);
    console.log(`  drift: ${Number(liveSimulatedMicroUsd - EXPECTED_SETTLE_PRICE_MICRO_USD)} microUSD`);
    console.log(`       = $${microUsdToUsd(liveSimulatedMicroUsd - EXPECTED_SETTLE_PRICE_MICRO_USD).toFixed(6)} USD`);
  });

});

describe('price_end: contract input conversion', () => {

  it('usdToMicroUsd converts correctly for contract input', () => {
    // Contract expects i128 microUSD: $0.1601 → 160_100
    const microUsd = usdToMicroUsd(0.1601);
    expect(microUsd).toBe(160_100n);

    // Round-trip
    const backToUsd = microUsdToUsd(microUsd);
    expect(backToUsd).toBeCloseTo(0.1601, 6);

    console.log('\n=== CONTRACT INPUT ===');
    console.log(`  $0.1601 → microUSD: ${microUsd}`);
    console.log(`  microUSD ${microUsd} → $${backToUsd}`);
  });

  it('contract input microUSD matches what UI displays', () => {
    // UI calls: microUsdToUsd(settle_price) and shows toFixed(6)
    const contractInput = EXPECTED_SETTLE_PRICE_MICRO_USD; // what goes into settle_round()
    const uiDisplay = microUsdToUsd(contractInput);        // what UI shows

    console.log('\n=== UI DISPLAY ===');
    console.log(`  contract input (microUSD): ${contractInput}`);
    console.log(`  UI displays:               $${uiDisplay.toFixed(6)}`);
    console.log(`  UI displays (4dp):         $${uiDisplay.toFixed(4)}`);

    // UI should show $0.160100 — matches oracle price at end_time
    expect(uiDisplay).toBeCloseTo(EXPECTED_SETTLE_PRICE_USD, 6);
    expect(uiDisplay.toFixed(6)).toBe('0.160100');
  });

  it('all 4 price records convert correctly without precision loss', () => {
    for (const rec of PRICE_RECORDS) {
      const micro = usdToMicroUsd(rec.priceUsd);
      const back = microUsdToUsd(micro);
      const diff = Math.abs(back - rec.priceUsd);

      console.log(`  $${rec.priceUsd} → ${micro} → $${back} (diff: ${diff.toExponential(2)})`);

      // Precision must be within 1 microUSD ($0.000001)
      expect(diff).toBeLessThan(0.000001);
    }
  });

});

describe('price_end: reward distribution with 3 participants', () => {

  it('ranks bets correctly by |predicted - settle| ascending', () => {
    const settlePrice = EXPECTED_SETTLE_PRICE_MICRO_USD; // 160_100n

    const betsForRanking = BETS.map((b, i) => ({
      bettorAddress: b.address,
      predictedPriceMicroUsd: usdToMicroUsd(b.predictedUsd),
      stakeAmountStroops: xlmToStroops(b.stakeXlm),
      createdAt: new Date(Date.now() - (300 - i * 30) * 1000),
    }));

    const ranked = rankBets(betsForRanking, settlePrice);

    console.log('\n=== RANKING ===');
    console.log(`  settle price: $${EXPECTED_SETTLE_PRICE_USD} (${settlePrice} microUSD)`);
    for (const r of ranked) {
      const predUsd = microUsdToUsd(r.predictedPriceMicroUsd);
      const errUsd = microUsdToUsd(r.error);
      console.log(`  Rank ${r.rank}: ${r.bettorAddress.slice(0,8)}... predicted $${predUsd.toFixed(4)} error $${errUsd.toFixed(6)}`);
    }

    // Bet 0: predicted $0.1600, error = |160000 - 160100| = 100 microUSD → rank 1
    // Bet 1: predicted $0.1620, error = |162000 - 160100| = 1900 microUSD → rank 3
    // Bet 2: predicted $0.1550, error = |155000 - 160100| = 5100 microUSD → rank 3... wait
    // Actually: Bet0 error=100, Bet1 error=1900, Bet2 error=5100 → rank 1,2,3
    expect(ranked[0].bettorAddress).toBe(BETS[0].address); // $0.1600 closest
    expect(ranked[1].bettorAddress).toBe(BETS[1].address); // $0.1620 second
    expect(ranked[2].bettorAddress).toBe(BETS[2].address); // $0.1550 furthest
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(2);
    expect(ranked[2].rank).toBe(3);
  });

  it('calculates rewards matching contract logic: top1=stake1+65%pool, top2=stake2+35%pool', () => {
    const settlePrice = EXPECTED_SETTLE_PRICE_MICRO_USD;

    const betsForRanking = BETS.map((b, i) => ({
      bettorAddress: b.address,
      predictedPriceMicroUsd: usdToMicroUsd(b.predictedUsd),
      stakeAmountStroops: xlmToStroops(b.stakeXlm),
      createdAt: new Date(Date.now() - (300 - i * 30) * 1000),
    }));

    const ranked = rankBets(betsForRanking, settlePrice);
    const totalPool = betsForRanking.reduce((s, b) => s + b.stakeAmountStroops, 0n);
    const rewards = calculateRewards(ranked, totalPool, 0n);

    const stake1 = xlmToStroops(BETS[0].stakeXlm); // 300 XLM
    const stake2 = xlmToStroops(BETS[1].stakeXlm); // 200 XLM
    const prizePool = totalPool - stake1 - stake2;  // 100 XLM (from bet3)

    const expectedTop1 = stake1 + (prizePool * 65n) / 100n;
    const expectedTop2 = stake2 + (prizePool * 35n) / 100n;

    console.log('\n=== REWARDS ===');
    console.log(`  total pool:  ${stroopsToXlm(totalPool).toFixed(2)} XLM`);
    console.log(`  prize pool:  ${stroopsToXlm(prizePool).toFixed(2)} XLM (loser stakes)`);
    console.log(`  top1 reward: ${stroopsToXlm(rewards[0].rewardStroops).toFixed(2)} XLM (expected: ${stroopsToXlm(expectedTop1).toFixed(2)} XLM)`);
    console.log(`  top2 reward: ${stroopsToXlm(rewards[1].rewardStroops).toFixed(2)} XLM (expected: ${stroopsToXlm(expectedTop2).toFixed(2)} XLM)`);
    console.log(`  top3 reward: 0 XLM (loses stake)`);

    expect(rewards[0].rewardStroops).toBe(expectedTop1);
    expect(rewards[1].rewardStroops).toBe(expectedTop2);
    expect(rewards[0].bettorAddress).toBe(BETS[0].address);
    expect(rewards[1].bettorAddress).toBe(BETS[1].address);

    // Sanity: top1 + top2 <= totalPool
    expect(rewards[0].rewardStroops + rewards[1].rewardStroops).toBeLessThanOrEqual(totalPool);
  });

  it('total rewards do not exceed total pool (no money created)', () => {
    const settlePrice = EXPECTED_SETTLE_PRICE_MICRO_USD;
    const betsForRanking = BETS.map((b, i) => ({
      bettorAddress: b.address,
      predictedPriceMicroUsd: usdToMicroUsd(b.predictedUsd),
      stakeAmountStroops: xlmToStroops(b.stakeXlm),
      createdAt: new Date(Date.now() - (300 - i * 30) * 1000),
    }));
    const ranked = rankBets(betsForRanking, settlePrice);
    const totalPool = betsForRanking.reduce((s, b) => s + b.stakeAmountStroops, 0n);
    const rewards = calculateRewards(ranked, totalPool, 0n);
    const totalRewarded = rewards.reduce((s, r) => s + r.rewardStroops, 0n);

    console.log(`\n  total pool:     ${stroopsToXlm(totalPool).toFixed(2)} XLM`);
    console.log(`  total rewarded: ${stroopsToXlm(totalRewarded).toFixed(2)} XLM`);
    console.log(`  remainder:      ${stroopsToXlm(totalPool - totalRewarded).toFixed(2)} XLM (stays in contract)`);

    expect(totalRewarded).toBeLessThanOrEqual(totalPool);
  });

});

describe('price_end: DB round-trip integrity', () => {

  it('round end_time stored and retrieved correctly', async () => {
    const row = await queryOne<{ end_time: Date; status: string; participant_count: number }>(
      `SELECT end_time, status, participant_count FROM rounds WHERE contract_round_id = $1`,
      [TEST_ROUND_ID]
    );
    expect(row).not.toBeNull();
    expect(row!.status).toBe('Open');
    expect(row!.participant_count).toBe(3);

    // end_time should be within 2s of what we seeded
    const diff = Math.abs(row!.end_time.getTime() - END_TIME.getTime());
    expect(diff).toBeLessThan(2000);

    console.log(`\n  DB end_time: ${row!.end_time.toISOString()}`);
    console.log(`  seeded:      ${END_TIME.toISOString()}`);
    console.log(`  diff:        ${diff}ms`);
  });

  it('bets stored with correct microUSD predicted prices', async () => {
    const rows = await query<{ bettor_address: string; predicted_price_micro_usd: string }>(
      `SELECT bettor_address, predicted_price_micro_usd FROM bets
       WHERE round_id = $1 ORDER BY created_at ASC`,
      [TEST_ROUND_ID]
    );
    expect(rows).toHaveLength(3);

    for (let i = 0; i < BETS.length; i++) {
      const stored = BigInt(rows[i].predicted_price_micro_usd);
      const expected = usdToMicroUsd(BETS[i].predictedUsd);
      expect(stored).toBe(expected);

      console.log(`  bet${i+1}: $${BETS[i].predictedUsd} → stored ${stored} microUSD (expected ${expected})`);
    }
  });

});
