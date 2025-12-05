import axios, { AxiosInstance, AxiosError, AxiosResponse } from "axios";

// ============================================================================
// Types
// ============================================================================

export type RiskTier = "low" | "med" | "high";

export type Strategy = {
  id: string;
  chainId: number;
  token: string;
  tokenAddress: string;
  vaultAddress: string;
  protocolName: string;
  apy: number;
  riskTier?: RiskTier;
  isActive: boolean;
};

export type ScoredStrategy = Strategy & {
  score: number;
};

export type StrategyPreferences = {
  riskTolerance: RiskTier;
  minApy: number;
};

export type DustAction = "swap" | "hold" | "ignore";

export type DustTokenMeta = {
  chainId: number;
  tokenAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  isDustSource: boolean;
  suggestedAction: DustAction;
  consolidationTarget?: string;
  notes?: string;
  isConsolidationTarget?: boolean;
  dustThreshold?: number;
};

export type DustBalance = {
  token: DustTokenMeta;
  balance: string;
  balanceUsd?: number;
  isDust: boolean;
};

// ============================================================================
// Request Types
// ============================================================================

export type PayRequest = {
  wallet: string;
  to: string;
  token: string;
  amount: string;
  chainId?: number;
};

export type RebalanceRequest = {
  wallet: string;
  token?: string;
  chainId?: number;
  riskTolerance?: RiskTier;
  preferredStrategyId?: string;
};

export type SweepDustRequest = {
  wallet: string;
  chainId?: number;
  consolidationToken?: string;
};

export type GetStrategiesParams = {
  chainId?: number;
};

// ============================================================================
// Response Types
// ============================================================================

export type PayResponse = {
  success: boolean;
  txHash?: string;
  message: string;
};

export type RebalanceResponse = {
  success: boolean;
  strategyUsed?: string;
  strategyScore?: number;
  txHash?: string;
  message: string;
};

export type SweepDustResponse = {
  success: boolean;
  swappedTokens?: string[];
  consolidatedTo?: string;
  txHash?: string;
  message: string;
};

export type StrategiesResponse = {
  token: string;
  chainId: number;
  strategies: Strategy[];
};

export type CurrentStrategyInfo = {
  id: string;
  protocol: string;
  name: string;
  apy: number;
  vaultAddress: string;
  adapterAddress?: string;
};

export type StrategyMetadata = {
  dataSource: "live" | "mock";
  fetchedAt?: string;
  expiresAt?: string;
};

export type WalletSummaryResponse = {
  wallet: string;
  owner?: string;
  chainId: number;
  isRegistered: boolean;
  currentStrategy?: CurrentStrategyInfo;
  fetchedAt: string;
  metadata: StrategyMetadata;
};

export type ErrorResponse = {
  error: string;
};

export type RegisterWalletResponse = {
  ok: boolean;
  wallet: string;
};

// ============================================================================
// Wallet Settings Types
// ============================================================================

export type TokenYieldConfig = {
  enabled: boolean;
};

export type AutoYieldTokens = {
  USDC: TokenYieldConfig;
  WETH: TokenYieldConfig;
};

export type DustConsolidationToken = "USDC" | "WETH" | "ETH";

export type WalletSettings = {
  checkingThreshold: string;
  autoYieldTokens: AutoYieldTokens;
  dustConsolidationToken: DustConsolidationToken;
  dustSweepEnabled: boolean;
  dustThreshold: string;
  riskTolerance: number;
  yieldStrategy: string;
};

export type WalletSettingsResponse = {
  wallet: string;
  settings: WalletSettings;
  updatedAt?: string;
};

export type WalletSettingsInput = Partial<WalletSettings>;

export type ValidationError = {
  field: string;
  message: string;
};

export type ValidationErrorResponse = {
  error: string;
  validationErrors: ValidationError[];
};

// ============================================================================
// API Error Handling
// ============================================================================

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly originalError?: AxiosError;

  constructor(
    message: string,
    status: number,
    code: string = "API_ERROR",
    originalError?: AxiosError
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.originalError = originalError;
  }
}

function unwrapServerError(error: unknown): never {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ErrorResponse>;
    const status = axiosError.response?.status ?? 500;
    const serverMessage = axiosError.response?.data?.error;
    const message = serverMessage ?? axiosError.message ?? "Unknown API error";

    let code = "API_ERROR";
    if (axiosError.code === "ECONNABORTED") code = "TIMEOUT";
    else if (axiosError.code === "ERR_NETWORK") code = "NETWORK_ERROR";
    else if (status === 400) code = "BAD_REQUEST";
    else if (status === 401) code = "UNAUTHORIZED";
    else if (status === 403) code = "FORBIDDEN";
    else if (status === 404) code = "NOT_FOUND";
    else if (status === 422) code = "VALIDATION_ERROR";
    else if (status >= 500) code = "SERVER_ERROR";

    throw new ApiError(message, status, code, axiosError);
  }

  if (error instanceof Error) {
    throw new ApiError(error.message, 500, "UNKNOWN_ERROR");
  }

  throw new ApiError("An unknown error occurred", 500, "UNKNOWN_ERROR");
}

// ============================================================================
// Axios Instance
// ============================================================================

function createAxiosInstance(): AxiosInstance {
  const baseURL = process.env.NEXT_PUBLIC_API_URL ?? "https://autopilot-account-production.up.railway.app";
  const timeout = parseInt(process.env.NEXT_PUBLIC_API_TIMEOUT_MS ?? "30000", 10);

  const instance = axios.create({
    baseURL,
    timeout,
    headers: {
      "Content-Type": "application/json",
    },
  });

  // Response interceptor for consistent error handling
  instance.interceptors.response.use(
    (response: AxiosResponse) => response,
    (error: AxiosError) => Promise.reject(error)
  );

  return instance;
}

const axiosInstance = createAxiosInstance();

// ============================================================================
// API Interface & Implementation
// ============================================================================

export type GetWalletSummaryParams = {
  token?: string;
  chainId?: number;
};

export interface AutopilotAPI {
  pay(request: PayRequest): Promise<PayResponse>;
  rebalance(request: RebalanceRequest): Promise<RebalanceResponse>;
  sweepDust(request: SweepDustRequest): Promise<SweepDustResponse>;
  getStrategies(token: string, params?: GetStrategiesParams): Promise<StrategiesResponse>;
  getWalletSummary(wallet: string, params?: GetWalletSummaryParams): Promise<WalletSummaryResponse>;
  getWalletSettings(wallet: string): Promise<WalletSettingsResponse>;
  saveWalletSettings(wallet: string, settings: WalletSettingsInput): Promise<WalletSettingsResponse>;
  registerWallet(wallet: string, owner: string): Promise<RegisterWalletResponse>;
}

async function pay(request: PayRequest): Promise<PayResponse> {
  try {
    const response = await axiosInstance.post<PayResponse>("/ops/pay", request);
    return response.data;
  } catch (error) {
    unwrapServerError(error);
  }
}

async function rebalance(request: RebalanceRequest): Promise<RebalanceResponse> {
  try {
    const response = await axiosInstance.post<RebalanceResponse>("/ops/rebalance", request);
    return response.data;
  } catch (error) {
    unwrapServerError(error);
  }
}

async function sweepDust(request: SweepDustRequest): Promise<SweepDustResponse> {
  try {
    const response = await axiosInstance.post<SweepDustResponse>("/ops/dust", request);
    return response.data;
  } catch (error) {
    unwrapServerError(error);
  }
}

async function getStrategies(
  token: string,
  params?: GetStrategiesParams
): Promise<StrategiesResponse> {
  try {
    const response = await axiosInstance.get<StrategiesResponse>(
      `/strategies/${encodeURIComponent(token)}`,
      { params }
    );
    return response.data;
  } catch (error) {
    unwrapServerError(error);
  }
}

async function getWalletSummary(
  wallet: string,
  params?: GetWalletSummaryParams
): Promise<WalletSummaryResponse> {
  try {
    const response = await axiosInstance.get<WalletSummaryResponse>(
      `/wallet/${encodeURIComponent(wallet)}/summary`,
      { params }
    );
    return response.data;
  } catch (error) {
    unwrapServerError(error);
  }
}

async function getWalletSettings(wallet: string): Promise<WalletSettingsResponse> {
  try {
    const response = await axiosInstance.get<WalletSettingsResponse>(
      `/wallet/${encodeURIComponent(wallet)}/settings`
    );
    return response.data;
  } catch (error) {
    unwrapServerError(error);
  }
}

async function saveWalletSettings(
  wallet: string,
  settings: WalletSettingsInput
): Promise<WalletSettingsResponse> {
  try {
    const response = await axiosInstance.post<WalletSettingsResponse>(
      `/wallet/${encodeURIComponent(wallet)}/settings`,
      settings
    );
    return response.data;
  } catch (error) {
    unwrapServerError(error);
  }
}

async function registerWallet(
  wallet: string,
  owner: string
): Promise<RegisterWalletResponse> {
  try {
    const response = await axiosInstance.post<RegisterWalletResponse>(
      "/register",
      { wallet, owner }
    );
    return response.data;
  } catch (error) {
    unwrapServerError(error);
  }
}

// ============================================================================
// Exported API Object
// ============================================================================

export const autopilotApi: AutopilotAPI = {
  pay,
  rebalance,
  sweepDust,
  getStrategies,
  getWalletSummary,
  getWalletSettings,
  saveWalletSettings,
  registerWallet,
};

// ============================================================================
// User Send Operations (UserOp-based flow)
// ============================================================================

export type PrepareSendParams = {
  walletAddress: string;
  recipient: string;
  amount: string;
  token?: string;
};

export type PrepareSendResponse = {
  userOp: Record<string, unknown>;
  userOpHash: string;
};

export type SubmitSignedParams = {
  userOp: Record<string, unknown>;
  signature: string;
};

export type SubmitSignedResponse = {
  hash: string;
  txHash: string;
};

// Prepare a send UserOp
export async function prepareSend(params: PrepareSendParams): Promise<PrepareSendResponse> {
  try {
    const response = await axiosInstance.post<PrepareSendResponse>("/ops/prepare-send", params);
    return response.data;
  } catch (error) {
    unwrapServerError(error);
  }
}

// Submit a signed UserOp
export async function submitSigned(params: SubmitSignedParams): Promise<SubmitSignedResponse> {
  try {
    const response = await axiosInstance.post<SubmitSignedResponse>("/ops/submit-signed", params);
    return response.data;
  } catch (error) {
    unwrapServerError(error);
  }
}

export default autopilotApi;
