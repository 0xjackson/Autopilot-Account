import {
  getStrategies,
  getRecommendation,
  getDustTokens,
  getDustSummary,
  ApiError,
} from "../frontend/lib/api/client";

async function testAll() {
  console.log("Testing API client against", process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001");

  try {
    console.log("\n1. getStrategies()");
    const strategies = await getStrategies();
    console.log("   ✓ token:", strategies.token);
    console.log("   ✓ strategies count:", strategies.strategies.length);

    console.log("\n2. getRecommendation('USDC')");
    const recommendation = await getRecommendation("USDC");
    console.log("   ✓ strategy:", recommendation.strategy.protocolName);
    console.log("   ✓ apy:", (recommendation.strategy.apy * 100).toFixed(2) + "%");

    console.log("\n3. getDustTokens()");
    const dustTokens = await getDustTokens();
    console.log("   ✓ totalCount:", dustTokens.totalCount);
    console.log("   ✓ dustSourceCount:", dustTokens.dustSourceCount);

    console.log("\n4. getDustSummary(wallet)");
    const summary = await getDustSummary(
      "0x1234567890abcdef1234567890abcdef12345678"
    );
    console.log("   ✓ wallet:", summary.wallet);
    console.log("   ✓ dustBalances count:", summary.dustBalances.length);

    console.log("\n✓ All tests passed!");
  } catch (err) {
    if (err instanceof ApiError) {
      console.error(`\n✗ ApiError: [${err.code}] ${err.status} - ${err.message}`);
    } else {
      console.error("\n✗ Unexpected error:", err);
    }
    process.exit(1);
  }
}

testAll();
