import { createPublicClient, http, type Address } from "viem";
import { base } from "viem/chains";

const client = createPublicClient({
  chain: base,
  transport: http("https://base.llamarpc.com"),
});

const OWNER = "0xCF9814943F7367D6bcc65169aB05f14eF8063969" as Address;
const WALLET = "0xD6e93D0F6C5881031A0A72b9cA90c614507Fd73D" as Address;

const FACTORIES = [
  { name: "cf10", addr: "0xcf10279BAA0d5407Dbb637517d23055A55E72923" },
  { name: "FBb9", addr: "0xFBb91eb4234558b191c393985eF34282B551e81B" },
  { name: "c627", addr: "0xc627874FE7444f8e9750e5043c19bA01E990D581" },
];

const FACTORY_ABI = [{
  name: "accountOf",
  type: "function",
  inputs: [{ name: "owner", type: "address" }],
  outputs: [{ name: "", type: "address" }],
  stateMutability: "view",
}] as const;

async function main() {
  const code = await client.getCode({ address: WALLET });
  console.log("Wallet deployed:", code && code !== "0x" ? "YES" : "NO");

  for (const f of FACTORIES) {
    const fc = await client.getCode({ address: f.addr as Address });
    if (!fc || fc === "0x") {
      console.log(f.name + ": factory not deployed");
      continue;
    }
    try {
      const acc = await client.readContract({
        address: f.addr as Address,
        abi: FACTORY_ABI,
        functionName: "accountOf",
        args: [OWNER],
      });
      console.log(f.name + ": accountOf =", acc);
    } catch (e: any) {
      console.log(f.name + ": error");
    }
  }
}
main();
