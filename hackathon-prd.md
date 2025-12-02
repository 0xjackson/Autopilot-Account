PRD: AutoYield Smart Wallet on Base
Working name: Autopilot Wallet (we can rename later)

0. One-Sentence Idea
A smart wallet on Base that automatically:
Keeps a “checking” balance in USDC (and optionally a few other tokens),


Routes excess into yield strategies (vaults or LPs),


Automatically frees funds from yield when you spend, and


Periodically / on-demand sweeps dust from random tokens into a token of your choice (e.g. USDC) so that can also be auto-yielded.


All of this happens inside a 4337 smart account using a custom ERC-7579 module, with gasless UX via a paymaster.

1. Goals & Non-Goals
1.1 Goals
Make a wallet where:


Users think in one simple mental model:


 “I set my checking buffer. Everything else goes to work.”



Users never have to manually:


move funds into yield vaults


move funds out of yield to pay someone


clean up dust / airdrop trash across 10 tokens


Showcase:


ERC-4337 UX (gasless, batching, smart account)


ERC-7579 module (policy + execution brain)


Base as the chain


USDC as primary asset


Optional: LP-style strategies to show composability


Be fully demoable in a hackathon:


Base Sepolia deployment


Clear UI


Live payment + auto-rebalance + dust sweep demo


1.2 Non-Goals (for v1 / hackathon scope)
No fully generic yield aggregator over the entire DeFi universe.


We will support a small curated set of strategies.


No auto-yield for every random token — we’ll support:


USDC for sure


Optionally a couple of others (e.g. WETH) if time.


No off-chain cron infra required for v1 “automation”.


Automation is primarily triggered when the user uses the wallet or clicks a button.


We do not custody user funds off-chain or via a backend.


All logic runs on-chain in the smart account + modules.



2. Core Concepts (Plain English)
Smart Account / 4337 Wallet
 A contract wallet on Base that can run custom logic when it sends transactions, and can be gasless via a paymaster.


Factory
 A contract that deploys new smart accounts for users and installs our auto-yield logic.


Module (ERC-7579)
 Pluggable “brain” for the wallet. Our module:


knows user preferences (threshold, strategies, dust token)


decides when to move tokens into or out of yield


can perform multi-call sequences (withdraw → pay → deposit)


Yield Strategy / Adapter
 A contract that knows how to talk to one specific yield source:


e.g. an ERC-4626 vault, or an LP router.


Paymaster
 A contract that pays gas on behalf of the user’s smart account, so the user doesn’t need ETH.


Dust Sweep
 A function that:


looks at all tiny balances of random tokens in the account


swaps them into a chosen “consolidation” token (e.g. USDC)


optionally auto-deposits that into the yield strategy.



3. User Flows (High-Level)
3.1 Onboarding / Wallet Creation
User goes to our dApp (e.g. app.autopilotwallet.xyz).


Connects their normal EOA wallet (Coinbase Wallet / MetaMask).


Clicks “Create Autopilot Wallet on Base”.


Signs one message.


A new 4337 smart wallet is deployed on Base with:


their EOA as the owner / validator


our AutoYield module installed


default settings (e.g. checking threshold = 50 USDC, no strategies enabled yet).


The user now has a new wallet address (the smart account) that they can send funds to.

3.2 Funding Wallet
User sends USDC (or other supported tokens) to their smart wallet address:


From a CEX


From an existing wallet


Optional: via Circle/Coinbase onramp.


The funds arrive directly in the smart account contract.


At this point, no auto-yield yet — just a normal smart account with tokens.

3.3 Configure Auto-Yield
User opens “Settings” screen:


Sets a checking threshold, e.g.:


“Keep at least 100 USDC in checking.”


Chooses which tokens to auto-yield:


“Auto-yield USDC ✅”


“Auto-yield WETH ❌”, etc.


Chooses dust consolidation token, e.g.:


“Sweep dust into USDC”.


Frontend sends a userOp to:


call AutoYieldModule.configureToken(token, adapter, params…)


call AutoYieldModule.setCheckingThreshold(threshold)


call AutoYieldModule.setDustConfig(consolidationToken, trackedTokens[])


These configs are stored on-chain in the module.



3.4 Make a Payment (Magic Moment)
User goes to “Pay” screen:
Chooses:


“Pay 20 USDC to 0xMerchant…”


Clicks “Pay with AutoYield”.


Frontend builds a userOp that calls:

 AutoYieldModule.executeWithAutoYield(
    token = USDC,
    to    = merchant,
    amount = 20,
    data   = USDC.transfer(merchant, 20)
)


Under the hood, in the module:


Check if USDC balance >= 20 + checkingThreshold.


If not, withdraw from vault / remove some LP until it is.


Execute the actual payment: USDC.transfer(merchant, 20).


After payment, if USDC balance > threshold:


Deposit the excess into yield (vault or LP).


This all happens in a single userOp:


Bundler posts it to EntryPoint.


EntryPoint calls our account.


Account calls the module.


Module calls vault/router, then merchant.


To the user:
 They saw one click, no gas popup, and their balances auto-rebalanced.

3.5 Dust Sweep
User clicks “Clean Up Wallet”:
User chooses in Settings:


Consolidation token: e.g. USDC


Which tokens to treat as dust sources: e.g. random airdrops, old LP tokens.


On “Clean Up Wallet”, frontend builds a userOp that calls:

 AutoYieldModule.sweepDustAndCompound()


Module does:


For each trackedToken:


If balance > 0 and not the consolidation token:


Swap entire balance to the consolidation token via router.


Then:


If consolidation token is yield-enabled:


Deposit into its strategy (vault/LP).


All swaps + deposit happen in one transaction (multicall).


Result:
 One token balance gets bigger (USDC), everything else tiny disappears, and that USDC is already working in yield.

4. Architecture Overview
4.1 Component Diagram (Conceptual)
                        ┌──────────────────────────┐
                         │        Frontend          │
                         │  (Next.js + OnchainKit)  │
                         └─────────┬────────────────┘
                                   │
                       Build UserOperation (via OnchainKit / viem)
                                   │
                           ┌───────▼────────┐
                           │   Bundler      │
                           │ (Pimlico/etc.) │
                           └───────┬────────┘
                                   │
                           ┌───────▼────────┐
                           │  EntryPoint    │
                           │ (4337 core)    │
                           └───────┬────────┘
                                   │
                      ┌────────────▼────────────┐
                      │    AutoYieldAccount     │
                      │  (4337 smart account)   │
                      └────────────┬────────────┘
                                   │
                    Route calls to modules (ERC-7579)
                                   │
            ┌──────────────────────┴──────────────────────┐
            │                                             │
┌───────────▼───────────┐                     ┌───────────▼───────────┐
│    AutoYieldModule    │                     │    (Other modules)    │
│  (Executor + Hooks)   │                     │  (validators, etc.)   │
└───────────┬───────────┘                     └───────────────────────┘
            │
            │ strategy calls
            │
┌───────────▼───────────┐        ┌──────────────────────┐
│    YieldAdapter       │        │   Router / Vaults    │
│ (per token strategy)  │◄──────►│ (DEX, ERC4626, etc.) │
└───────────────────────┘        └──────────────────────┘

       ┌──────────────────────┐
       │   AutoYieldPaymaster │
       │ (sponsors gas for    │
       │  allowed operations) │
       └──────────────────────┘


5. Detailed System Components
5.1 Smart Account & Factory
5.1.1 AutoYieldAccount (Smart Account)
Responsibilities:
Holds user funds (USDC, LP tokens, vault tokens).


Implements validateUserOp for 4337.


Forwards execute calls to target contracts.


Manages installed 7579 modules.


Key behaviors:
validateUserOp:


Verifies signature (owner EOA or session key).


Optionally defers to a validator module (if we want full 7579 validation).


execute(to, value, data, operation):


Only callable by:


EntryPoint, or


installed 7579 modules (e.g. AutoYieldModule).


Executes the call from the wallet.


For hackathon: we can reuse an existing account implementation (e.g. Kernel or a simple 4337 account) to save time and just focus on module logic.

5.1.2 AutoYieldAccountFactory
Responsibilities:
Deploy new AutoYieldAccount contracts.


Install AutoYieldModule for each new account.


Set EOA owner and initial config.


Key function:
function createAccount(
    address owner,
    AutoYieldInitConfig calldata config
) external returns (address account);

Steps:


deploy AutoYieldAccount (optionally with CREATE2).


Set account.owner = owner.


Register AutoYieldModule as an installed 7579 module.


Call AutoYieldModule.initForAccount(account, config).



5.2 AutoYield Module (ERC-7579 Module)
5.2.1 Responsibilities
This is the core brain of the product.
Store config per account:


checkingThreshold (per token, but initially for USDC)


strategy mapping: token => YieldAdapter


dust config:


consolidationToken


trackedTokens[]


Implement:


executeWithAutoYield — wrap user actions with:


pre: ensure enough checking balance


execute: actual user transfer / call


post: push excess into yield


rebalance() — manual optimization


flushToChecking() — pull everything back into token


sweepDustAndCompound() — dust → consolidation token → yield


5.2.2 Key functions (conceptual signatures)
struct TokenStrategyConfig {
    address adapter;          // YieldAdapter for this token
    uint16  targetLPBP;       // optional, for LP strategies
    uint16  maxAllocationBP;  // max % of this token that can go into strategy
    bool    enabled;
}

struct DustConfig {
    address consolidationToken; // e.g. USDC
    address[] trackedTokens;    // tokens considered "dust sources"
}

contract AutoYieldModule is IModule {
    // ===== Config =====
    function setCheckingThreshold(address token, uint256 threshold) external;
    function configureTokenStrategy(address token, TokenStrategyConfig calldata cfg) external;
    function setDustConfig(DustConfig calldata cfg) external;

    // ===== Core execution wrapper =====
    function executeWithAutoYield(
        address token,        // token user is spending (e.g. USDC)
        address to,           // recipient / contract
        uint256 amount,       // amount in token
        bytes calldata data   // calldata (e.g. ERC20.transfer)
    ) external;

    // ===== Maintenance / utilities =====
    function rebalance() external;
    function flushToChecking(address token) external;
    function sweepDustAndCompound() external;
}

All these functions are called via the smart account, not via the EOA directly.
 In practice, the user signs a 4337 userOp that calls these through EntryPoint → Account → Module.
5.2.3 Internal logic
_ensureCheckingBalance(token, amount):


If token == USDC (for v1):


Compute required = amount + checkingThreshold[token].


If USDC_balance < required:


ask YieldAdapter to withdraw required - balance worth from yield.


If needed, also unwind LP (via adapter).


_pushExcessToYield(token):


After execution, recompute balance.


If balance > checkingThreshold[token]:


deposit balance - threshold into yield via adapter.


_rebalanceToStrategies(token):


Called by rebalance(): moves current surplus into strategies up to maxAllocationBP.


_sweepDust():


For each trackedToken:


bal = balanceOf(trackedToken)


If > 0 and not consolidationToken:


swap token → consolidationToken via router (DEX).


_compoundDust():


After _sweepDust, if consolidationToken has a strategy adapter and is enabled:


deposit balance into yield via adapter.


executeWithAutoYield uses these internally to orchestrate.

5.3 YieldAdapter & Yield Sources
5.3.1 IYieldAdapter interface
interface IYieldAdapter {
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external returns (uint256 withdrawn);
    function totalValue() external view returns (uint256);
}

Implementation idea:
VaultAdapter: wraps an ERC-4626 vault.


LPAdapter: uses a router to:


swap half to paired token


add liquidity


later remove liquidity and swap back into base token.


For hackathon, we can:
Keep it simple:


Use a simple ERC-4626 vault contract:


MockYieldVault that:


accepts USDC


mints vaultShares


for demo, we can fudge yield (e.g. allow withdrawing 105% after certain blocks).


5.3.2 MockYieldVault (for demo)
Holds USDC.


Provides:


deposit(uint256 assets, address receiver) returns (uint256 shares)


withdraw(uint256 assets, address receiver, address owner) returns (uint256 shares)


We can simulate APY by:


increasing an “exchange rate” over time


or simply ignoring APY in code and just verbally explaining yield.



5.4 Paymaster
5.4.1 AutoYieldPaymaster
Responsibilities:
Sponsor gas for userOps that:


call AutoYieldModule functions (executeWithAutoYield, rebalance, sweep).


maybe calls to configure module.


Key behavior:
function validatePaymasterUserOp(
    UserOperation calldata userOp,
    bytes32 userOpHash,
    uint256 maxCost
) external returns (bytes memory context, uint256 validationData);

Checks:


userOp.sender is an AutoYieldAccount.


userOp.callData targets our module or account with known function selectors.


If valid:


commit to paying gas.


We pre-fund the paymaster with ETH on Base (or Sepolia).


User never needs to see/hold ETH for normal operations.

6. Frontend & Backend Responsibilities
6.1 Frontend (Next.js / React)
Pages / features:
Landing (/)


Simple explanation


Connect wallet


Button: “Create Autopilot Wallet”


Dashboard (/dashboard)


Show:


checking balance (e.g. USDC)


yield balance (vault shares)


total value


Show:


config: checking threshold


enabled tokens / strategies


Buttons:


“Rebalance Now”


“Clean Up Wallet”


Pay (/pay)


Form:


Recipient address


Token (USDC)


Amount


Button: “Pay with AutoYield”


After click:


Build userOp calling executeWithAutoYield.


Use OnchainKit / bundler client to send.


Integrations:
Base OnchainKit / Coinbase Wallet SDK


For connecting EOA.


For 4337 smart account creation:


createSmartAccount → uses Factory initCode.


For sending userOps:


sendUserOperation({ to: AutoYieldModule, data: executeWithAutoYieldData, paymaster: AutoYieldPaymaster }).


viem / wagmi


For contract interactions (read).


For reading on-chain data such as:


balances


thresholds


vault value.


(Optional) Circle / Coinbase Pay


UI button: “Deposit from bank/card”.


Behind the scenes:


call Circle sandbox API to generate deposit intent into the smart account address.


For hackathon: we can stub this or keep it minimal.



6.2 Backend (Optional / Minimal)
For the hackathon, backend is nice-to-have, not required.
Possible backend tasks:
Fetch APYs from external APIs / subgraphs.


Maintain a curated list of “safe strategies”.


Provide a simple REST endpoint:


GET /strategies/usdc → returns the recommended adapter address & APY.


Provide an SDK function to the frontend.


But core system works without backend:
Strategies can be hardcoded or manually configured in contracts.


APY can be shown as a static or manually entered value.



7. Security & Constraints
User opt-in:


Auto-yield only applies to tokens the user explicitly configures.


Per-token caps:


Each token strategy has:


maxAllocationBP (max % of that token to allocate into yield).


Safe addresses only:


In hackathon, we’ll hardcode strategy adapters in the module or factory.


No user-supplied random adapters.


Validator sanity:


The validator / account can:


reject userOps where the module tries to exceed configured caps.


This prevents malicious module upgrades from hijacking funds.



8. Deliverables & Milestones
8.1 Smart Contracts
AutoYieldAccount.sol


Minimal 4337 account, or fork from Kernel.


AutoYieldAccountFactory.sol


Deploys new accounts.


Installs AutoYieldModule.


AutoYieldModule.sol


Implements config, executeWithAutoYield, rebalance, flushToChecking, sweepDustAndCompound.


IYieldAdapter.sol


VaultAdapter.sol


For USDC -> MockYieldVault.


MockYieldVault.sol (ERC-4626-like).


AutoYieldPaymaster.sol


(Optional) MockDexRouter.sol for dust swap / LP demo.


8.2 Frontend
Wallet creation flow


connect EOA, create smart account


Dashboard


show balances & config


“Rebalance Now” button


“Clean Up Wallet” button


Pay screen


simple send flow using executeWithAutoYield


OnchainKit integration for:


userOps


bundler


8.3 Demo Script
Scenario:


Show empty dashboard.


Create new Autopilot wallet.


Send test USDC into it from EOA.


Set checking threshold and enable USDC strategy.


Click “Rebalance Now”:


Show funds moved from checking → yield.


Show dust tokens (airdrop some mock tokens).


Click “Clean Up Wallet”:


Watch dust swapped into USDC and deposited into yield.


Go to Pay screen:


Pay 20 USDC to merchant.


Show:


a) Module freed needed USDC from yield


b) Payment succeeded


c) Remaining balance re-yielded.


Open block explorer showing a single transaction containing multiple internal calls.



9. Summary
In simple terms for the team:
We’re building a smart wallet on Base that:


Makes yield automatic.


Makes paying from yield automatic.


Keeps your “spend vs invest” logic inside the wallet itself.


Cleans up stray tokens and folds them into yield.


Technically:


It’s an ERC-4337 smart account with a custom ERC-7579 module that:


runs pre/post hooks around your actions,


moves funds between checking & yield,


and can multicall dust sweeping → consolidation → deposit.


UX:


User does normal stuff:


receives USDC,


sends USDC,


clicks “clean wallet”.


Everything else (moving to/from vaults/LPs, consolidating dust) is automatic, gasless, and invisible.
WORK DELEGATION

Jackson
Ticket
Description
Deliverable
1.1
AutoYield Smart Wallet (ERC-4337)
Can validate UserOps + execute transfers
1.2
7579 Module System
installModule(), uninstallModule(), registry
1.3
Wallet Factory
deploy wallet + autoinstall AutoYieldModule
2.1
On-chain config storage for thresholds / tracking
setThreshold / setStrategy / setDustConfig
2.2
executeWithAutoYield
payment wrapper: withdraw if needed → execute → redeposit
2.3
rebalance()
deposit excess into yield vault
2.4
sweepDustAndCompound()
swap dust → USDC → deposit
2.5
Safety / caps
maxAllocationBP checks
3.1
Yield Adapter interface
IXAdapter.sol
3.2
4626 adapter
supports deposit/withdraw
3.3
Mock Yield Vault
needed for demo
4.1
Paymaster validation
sponsor gas for module calls
4.2
Paymaster policy
only sponsor txs from AutoYield wallets

Acceptance criteria for you
Wallet deploys through factory with module pre-installed


UserOp: pay merchant → funds auto-unstake + top-up gasless


Dust sweep → USDC → redeposit → viewable in UI balances

Bryce — Backend / Yield Strategy / Data Automation
Backend Tickets (Bryce)
Ticket
Description
Deliverable
B1
Index protocols with highest yield
Small API aggregator returning APY + vault address
B2
Strategy selector
Score vaults & pick best based on risk + APY
B3
Auto-rebalance scheduler
(crontab / keep-alive) pings wallets when yield conditions met
B4
Dust token metadata service
returns dust list + consolidated token
B5
Bundler integration service
backend composes the userOp needed for: rebalance / dust sweep / payment-withdraw
B6
Paymaster server
prepaid balance → mint sponsor signature

Acceptance criteria
Returns a JSON payload the frontend can call:
 POST /recommend?wallet=0x → best strategy


POST /ops/pay returns a fully composed UserOp ready for onchain


No backend system depends on contract deployment to begin implementation

Logan
Frontend Tickets for Logan
Ticket
Description
Deliverable
F1
Wallet creation UI
Create Wallet → calls factory API → shows address
F2
Dashboard
checking + yield + dust balances
F3
Settings screen
threshold, toggles, dust target, risk tolerance
F4
Rebalance button
calls backend /ops/rebalance
F5
Dust sweep button
calls backend /ops/dust
F6
Pay screen
pay → triggers /ops/pay → confirmation
F7
Transaction status toasts
success / failure toasts pulled from backend response
F8
“Magic Moment” page
theme for hackathon demo — show staked → auto unstake → pay → restake

Acceptance criteria
No raw blockchain RPC calls are needed — just backend endpoints


Fully styled — must look clean enough to win




Robby
Tickets for Robby


Ticket
Description
Deliverable
R1
REST client wrapper
Axios wrapper for backend endpoints
R2
Wallet context
central store to manage wallet addresses & balances
R3
Balance polling
hit backend every X sec for balances
R4
Yield analytics sidebar
APY chart + last deposit timestamp
R5
Merchant demo site
separate page showing “payment received!”
R6
Guided onboarding
coach marks that explain the UX to judges
R7
"Reload Demo" script
reset wallet + send funds + dust for stage demos

Acceptance criteria
Demo can be run start → finish → reset in < 2 mins


Merchant screen shows payment instantly when test run happens



Providers & Stack Selection
This section specifies every external tool, SDK, and protocol used across the system, plus backup options when applicable. The intent is to ensure the entire build is unblocked from day one, with no ambiguity on providers or infra.
Smart Account + Module Layer
The smart account will be built using ZeroDev Kernel v3, which supports ERC-4337 accounts and direct installation of ERC-7579 modules.


The AutoYieldModule will be a custom ERC-7579 module using the Rhinestone 7579 module interface. We deploy our own validator/executor module, we do not depend on an external module registry.


Bundler + Gas Sponsorship
Base’s native Bundler RPC will be used for userOp broadcasting.


Base Paymaster (Coinbase Developer Platform) will be used for full gas abstraction. This eliminates the need for Pimlico/StackUp, and guarantees the experience is “no ETH needed anywhere”.


Optional stretch: sponsor only wallet functions originating from AutoYieldModule to prevent malicious gas drains.


UserOp / Client SDKs
OnchainKit Smart Wallet client will be used for building and sending userOps.


viem + Wagmi will be used for general RPC reads and interaction inside the frontend.


Coinbase Wallet SDK for onboarding the user’s EOA during wallet creation.


Assets + Yield Sources
The primary asset used for yield automation will be USDC (native on Base).


The first yield strategy will use ERC-4626-compatible vaults on Base. Expected implementation:


Aerodrome vaults or Beefy vaults depending on APY and reliability.


If external APYs become unreliable during hackathon time, fallback will be a Mock Yield Vault (ERC-4626 interface) to guarantee demo stability.


If time permits, an LP adapter will be added for Aerodrome LP pairs.


DEX + Swap Layer for Dust Consolidation
For dust swapping and consolidation, the preferred router is Aerodrome Router on Base.


Fallback option: Uniswap v3 router on Base.


Sane default slippage % will be enforced to avoid edge-case mispricing.


APY / Yield Discovery
Backend (or static config for hackathon) pulls yield data from:
DefiLlama Yields API


Beefy subgraph


Aerodrome analytics API


Morpho Blue / Spark if needed


The backend exposes a simple REST endpoint:
 /strategies/<token> → returns the recommended vault/adapter and APY.
If time is limited, vault selection will be deterministic rather than dynamic.
Indexing / Metadata
Balances and logs will be read using Base RPC via OnchainKit + viem.


Yield/token metadata can additionally use:


DefiLlama API


The Graph for Beefy and Aerodrome


Explorer links for transactions will use BaseScan.


On/Off-Ramp (Optional)
If we include a deposit UX from fiat, the preferred ramp provider is Circle APIs or Coinbase Pay Widget. This is optional and can be mocked if time is constrained.
Hosting / infra
Smart contracts deployed on Base Sepolia for hackathon demo.


Backend (if used) hosted on Vercel serverless or Cloudflare workers for minimal infra overhead.



