import { describe, it, expect, vi, beforeEach, afterEach, Mock } from "vitest";
import axios from "axios";

// Mock axios before importing the client
vi.mock("axios", () => {
  const mockAxiosInstance = {
    post: vi.fn(),
    get: vi.fn(),
    interceptors: {
      response: {
        use: vi.fn(),
      },
    },
  };

  return {
    default: {
      create: vi.fn(() => mockAxiosInstance),
      isAxiosError: vi.fn((error: unknown) => {
        return (
          error !== null &&
          typeof error === "object" &&
          "isAxiosError" in error &&
          (error as { isAxiosError: boolean }).isAxiosError === true
        );
      }),
    },
    AxiosError: class MockAxiosError extends Error {
      isAxiosError = true;
      response?: { status: number; data?: { error?: string } };
      code?: string;

      constructor(
        message: string,
        code?: string,
        _config?: unknown,
        _request?: unknown,
        response?: { status: number; data?: { error?: string } }
      ) {
        super(message);
        this.name = "AxiosError";
        this.code = code;
        this.response = response;
      }
    },
    AxiosHeaders: class MockAxiosHeaders {},
  };
});

// Store original env
const originalEnv = { ...process.env };

describe("Autopilot API Client", () => {
  let mockAxiosInstance: {
    post: Mock;
    get: Mock;
    interceptors: { response: { use: Mock } };
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    // Reset env vars
    process.env = { ...originalEnv };
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.test.com";
    process.env.NEXT_PUBLIC_API_TIMEOUT_MS = "5000";

    // Get reference to mock instance
    mockAxiosInstance = (axios.create as Mock)() as typeof mockAxiosInstance;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Axios Instance Configuration", () => {
    it("should create axios instance with correct baseURL from env", async () => {
      process.env.NEXT_PUBLIC_API_BASE_URL = "https://custom-api.example.com";

      // Re-import to trigger createAxiosInstance with new env
      vi.resetModules();
      await import("../../lib/api/client");

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: "https://custom-api.example.com",
        })
      );
    });

    it("should create axios instance with correct timeout from env", async () => {
      process.env.NEXT_PUBLIC_API_TIMEOUT_MS = "10000";

      vi.resetModules();
      await import("../../lib/api/client");

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 10000,
        })
      );
    });

    it("should use default baseURL when env var is not set", async () => {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;

      vi.resetModules();
      await import("../../lib/api/client");

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: "http://localhost:3001",
        })
      );
    });

    it("should use default timeout when env var is not set", async () => {
      delete process.env.NEXT_PUBLIC_API_TIMEOUT_MS;

      vi.resetModules();
      await import("../../lib/api/client");

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 30000,
        })
      );
    });

    it("should set Content-Type header to application/json", async () => {
      vi.resetModules();
      await import("../../lib/api/client");

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {
            "Content-Type": "application/json",
          },
        })
      );
    });
  });

  describe("API Methods Existence", () => {
    it("should export autopilotApi with all required methods", async () => {
      const { autopilotApi } = await import("../../lib/api/client");

      expect(autopilotApi).toBeDefined();
      expect(typeof autopilotApi.pay).toBe("function");
      expect(typeof autopilotApi.rebalance).toBe("function");
      expect(typeof autopilotApi.sweepDust).toBe("function");
      expect(typeof autopilotApi.getStrategies).toBe("function");
    });

    it("should export AutopilotAPI interface types", async () => {
      const clientModule = await import("../../lib/api/client");

      // Verify the exported api conforms to AutopilotAPI interface
      const api: typeof clientModule.autopilotApi = clientModule.autopilotApi;
      expect(api).toBeDefined();
    });
  });

  describe("pay()", () => {
    it("should call POST /ops/pay with correct request body", async () => {
      const { autopilotApi } = await import("../../lib/api/client");

      const payRequest = {
        wallet: "0x1234567890abcdef1234567890abcdef12345678",
        to: "0xabcdef1234567890abcdef1234567890abcdef12",
        token: "USDC",
        amount: "100.00",
        chainId: 8453,
      };

      const mockResponse = {
        data: {
          success: true,
          txHash: "0xabc123",
          message: "Payment successful",
        },
      };

      mockAxiosInstance.post.mockResolvedValueOnce(mockResponse);

      const result = await autopilotApi.pay(payRequest);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith("/ops/pay", payRequest);
      expect(result).toEqual(mockResponse.data);
    });

    it("should validate request body shape contains required fields", async () => {
      const { autopilotApi } = await import("../../lib/api/client");

      const payRequest = {
        wallet: "0x1234567890abcdef1234567890abcdef12345678",
        to: "0xabcdef1234567890abcdef1234567890abcdef12",
        token: "USDC",
        amount: "50.00",
      };

      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { success: true, message: "OK" },
      });

      await autopilotApi.pay(payRequest);

      const [url, body] = mockAxiosInstance.post.mock.calls[0];
      expect(url).toBe("/ops/pay");
      expect(body).toHaveProperty("wallet");
      expect(body).toHaveProperty("to");
      expect(body).toHaveProperty("token");
      expect(body).toHaveProperty("amount");
    });

    it("should return typed PayResponse on success", async () => {
      const { autopilotApi } = await import("../../lib/api/client");

      const mockResponse = {
        data: {
          success: true,
          txHash: "0xdef456",
          message: "Payment processed",
        },
      };

      mockAxiosInstance.post.mockResolvedValueOnce(mockResponse);

      const result = await autopilotApi.pay({
        wallet: "0x1234567890abcdef1234567890abcdef12345678",
        to: "0xabcdef1234567890abcdef1234567890abcdef12",
        token: "ETH",
        amount: "1.5",
      });

      expect(result.success).toBe(true);
      expect(result.txHash).toBe("0xdef456");
      expect(result.message).toBe("Payment processed");
    });
  });

  describe("rebalance()", () => {
    it("should call POST /ops/rebalance with correct URL and method", async () => {
      const { autopilotApi } = await import("../../lib/api/client");

      const rebalanceRequest = {
        wallet: "0x1234567890abcdef1234567890abcdef12345678",
        token: "USDC",
        chainId: 8453,
        riskTolerance: "med" as const,
      };

      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          success: true,
          strategyUsed: "aave-usdc-base",
          strategyScore: 0.85,
          message: "Rebalanced successfully",
        },
      });

      const result = await autopilotApi.rebalance(rebalanceRequest);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith("/ops/rebalance", rebalanceRequest);
      expect(result.success).toBe(true);
      expect(result.strategyUsed).toBe("aave-usdc-base");
    });

    it("should return typed RebalanceResponse", async () => {
      const { autopilotApi } = await import("../../lib/api/client");

      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          success: true,
          strategyUsed: "moonwell-usdc",
          strategyScore: 0.92,
          txHash: "0x789abc",
          message: "Rebalance complete",
        },
      });

      const result = await autopilotApi.rebalance({
        wallet: "0x1234567890abcdef1234567890abcdef12345678",
      });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("message");
      expect(typeof result.strategyScore).toBe("number");
    });
  });

  describe("sweepDust()", () => {
    it("should call POST /ops/dust with correct URL and method", async () => {
      const { autopilotApi } = await import("../../lib/api/client");

      const sweepRequest = {
        wallet: "0x1234567890abcdef1234567890abcdef12345678",
        chainId: 8453,
        consolidationToken: "USDC",
      };

      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          success: true,
          swappedTokens: ["DEGEN", "AERO"],
          consolidatedTo: "USDC",
          message: "Dust swept",
        },
      });

      const result = await autopilotApi.sweepDust(sweepRequest);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith("/ops/dust", sweepRequest);
      expect(result.success).toBe(true);
      expect(result.swappedTokens).toEqual(["DEGEN", "AERO"]);
    });

    it("should return typed SweepDustResponse", async () => {
      const { autopilotApi } = await import("../../lib/api/client");

      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          success: true,
          swappedTokens: ["TOKEN1"],
          consolidatedTo: "WETH",
          txHash: "0xsweep123",
          message: "Dust consolidated",
        },
      });

      const result = await autopilotApi.sweepDust({
        wallet: "0x1234567890abcdef1234567890abcdef12345678",
      });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("message");
      expect(Array.isArray(result.swappedTokens)).toBe(true);
    });
  });

  describe("getStrategies()", () => {
    it("should call GET /strategies/:token with correct URL", async () => {
      const { autopilotApi } = await import("../../lib/api/client");

      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          token: "USDC",
          chainId: 8453,
          strategies: [
            {
              id: "aave-usdc-base",
              chainId: 8453,
              token: "USDC",
              tokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              vaultAddress: "0xvault123",
              protocolName: "Aave",
              apy: 0.12,
              riskTier: "low",
              isActive: true,
            },
          ],
        },
      });

      const result = await autopilotApi.getStrategies("USDC");

      expect(mockAxiosInstance.get).toHaveBeenCalledWith("/strategies/USDC", { params: undefined });
      expect(result.token).toBe("USDC");
      expect(result.strategies).toHaveLength(1);
    });

    it("should URL-encode special characters in token name", async () => {
      const { autopilotApi } = await import("../../lib/api/client");

      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { token: "TOKEN/SPECIAL", chainId: 8453, strategies: [] },
      });

      await autopilotApi.getStrategies("TOKEN/SPECIAL");

      expect(mockAxiosInstance.get).toHaveBeenCalledWith("/strategies/TOKEN%2FSPECIAL", {
        params: undefined,
      });
    });

    it("should pass chainId as query param when provided", async () => {
      const { autopilotApi } = await import("../../lib/api/client");

      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { token: "WETH", chainId: 1, strategies: [] },
      });

      await autopilotApi.getStrategies("WETH", { chainId: 1 });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith("/strategies/WETH", {
        params: { chainId: 1 },
      });
    });

    it("should return typed StrategiesResponse", async () => {
      const { autopilotApi } = await import("../../lib/api/client");

      const mockStrategies = [
        {
          id: "strategy-1",
          chainId: 8453,
          token: "USDC",
          tokenAddress: "0xtoken",
          vaultAddress: "0xvault",
          protocolName: "Protocol",
          apy: 0.15,
          riskTier: "med" as const,
          isActive: true,
        },
      ];

      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          token: "USDC",
          chainId: 8453,
          strategies: mockStrategies,
        },
      });

      const result = await autopilotApi.getStrategies("USDC");

      expect(result).toHaveProperty("token");
      expect(result).toHaveProperty("chainId");
      expect(result).toHaveProperty("strategies");
      expect(Array.isArray(result.strategies)).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should throw ApiError with BAD_REQUEST code for 400 errors", async () => {
      const { autopilotApi } = await import("../../lib/api/client");

      const axiosError = {
        isAxiosError: true,
        message: "Bad Request",
        response: {
          status: 400,
          data: { error: "Invalid wallet address" },
        },
      };

      mockAxiosInstance.post.mockRejectedValueOnce(axiosError);

      await expect(
        autopilotApi.pay({
          wallet: "invalid",
          to: "0xabcdef",
          token: "USDC",
          amount: "100",
        })
      ).rejects.toMatchObject({
        message: "Invalid wallet address",
        status: 400,
        code: "BAD_REQUEST",
      });
    });

    it("should throw ApiError with NOT_FOUND code for 404 errors", async () => {
      const { autopilotApi } = await import("../../lib/api/client");

      const axiosError = {
        isAxiosError: true,
        message: "Not Found",
        response: {
          status: 404,
          data: { error: "Strategy not found" },
        },
      };

      mockAxiosInstance.get.mockRejectedValueOnce(axiosError);

      await expect(autopilotApi.getStrategies("UNKNOWN_TOKEN")).rejects.toMatchObject({
        status: 404,
        code: "NOT_FOUND",
      });
    });

    it("should throw ApiError with SERVER_ERROR code for 500+ errors", async () => {
      const { autopilotApi } = await import("../../lib/api/client");

      const axiosError = {
        isAxiosError: true,
        message: "Internal Server Error",
        response: {
          status: 500,
          data: { error: "Database connection failed" },
        },
      };

      mockAxiosInstance.post.mockRejectedValueOnce(axiosError);

      await expect(
        autopilotApi.rebalance({
          wallet: "0x1234567890abcdef1234567890abcdef12345678",
        })
      ).rejects.toMatchObject({
        status: 500,
        code: "SERVER_ERROR",
      });
    });

    it("should throw ApiError with UNAUTHORIZED code for 401 errors", async () => {
      const { autopilotApi } = await import("../../lib/api/client");

      const axiosError = {
        isAxiosError: true,
        message: "Unauthorized",
        response: {
          status: 401,
          data: { error: "Invalid API key" },
        },
      };

      mockAxiosInstance.post.mockRejectedValueOnce(axiosError);

      await expect(
        autopilotApi.pay({
          wallet: "0x1234",
          to: "0x5678",
          token: "USDC",
          amount: "10",
        })
      ).rejects.toMatchObject({
        status: 401,
        code: "UNAUTHORIZED",
      });
    });

    it("should throw ApiError with FORBIDDEN code for 403 errors", async () => {
      const { autopilotApi } = await import("../../lib/api/client");

      const axiosError = {
        isAxiosError: true,
        message: "Forbidden",
        response: {
          status: 403,
          data: { error: "Access denied" },
        },
      };

      mockAxiosInstance.post.mockRejectedValueOnce(axiosError);

      await expect(
        autopilotApi.sweepDust({
          wallet: "0x1234567890abcdef1234567890abcdef12345678",
        })
      ).rejects.toMatchObject({
        status: 403,
        code: "FORBIDDEN",
      });
    });

    it("should throw ApiError with VALIDATION_ERROR code for 422 errors", async () => {
      const { autopilotApi } = await import("../../lib/api/client");

      const axiosError = {
        isAxiosError: true,
        message: "Unprocessable Entity",
        response: {
          status: 422,
          data: { error: "Amount must be positive" },
        },
      };

      mockAxiosInstance.post.mockRejectedValueOnce(axiosError);

      await expect(
        autopilotApi.pay({
          wallet: "0x1234567890abcdef1234567890abcdef12345678",
          to: "0xabcdef1234567890abcdef1234567890abcdef12",
          token: "USDC",
          amount: "-100",
        })
      ).rejects.toMatchObject({
        status: 422,
        code: "VALIDATION_ERROR",
      });
    });

    it("should extract error message from server response", async () => {
      const { autopilotApi } = await import("../../lib/api/client");

      const axiosError = {
        isAxiosError: true,
        message: "Request failed",
        response: {
          status: 400,
          data: { error: "Custom server error message" },
        },
      };

      mockAxiosInstance.post.mockRejectedValueOnce(axiosError);

      await expect(
        autopilotApi.pay({
          wallet: "0x1234",
          to: "0x5678",
          token: "USDC",
          amount: "10",
        })
      ).rejects.toMatchObject({
        message: "Custom server error message",
      });
    });

    it("should fallback to axios message when server error message is missing", async () => {
      const { autopilotApi } = await import("../../lib/api/client");

      const axiosError = {
        isAxiosError: true,
        message: "Network Error",
        response: {
          status: 500,
          data: {},
        },
      };

      mockAxiosInstance.post.mockRejectedValueOnce(axiosError);

      await expect(
        autopilotApi.rebalance({
          wallet: "0x1234567890abcdef1234567890abcdef12345678",
        })
      ).rejects.toMatchObject({
        message: "Network Error",
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle timeout errors with TIMEOUT code", async () => {
      const { autopilotApi } = await import("../../lib/api/client");

      const timeoutError = {
        isAxiosError: true,
        message: "timeout of 5000ms exceeded",
        code: "ECONNABORTED",
        response: undefined,
      };

      mockAxiosInstance.post.mockRejectedValueOnce(timeoutError);

      await expect(
        autopilotApi.pay({
          wallet: "0x1234567890abcdef1234567890abcdef12345678",
          to: "0xabcdef1234567890abcdef1234567890abcdef12",
          token: "USDC",
          amount: "100",
        })
      ).rejects.toMatchObject({
        code: "TIMEOUT",
        status: 500,
      });
    });

    it("should handle network errors with NETWORK_ERROR code", async () => {
      const { autopilotApi } = await import("../../lib/api/client");

      const networkError = {
        isAxiosError: true,
        message: "Network Error",
        code: "ERR_NETWORK",
        response: undefined,
      };

      mockAxiosInstance.get.mockRejectedValueOnce(networkError);

      await expect(autopilotApi.getStrategies("USDC")).rejects.toMatchObject({
        code: "NETWORK_ERROR",
        status: 500,
      });
    });

    it("should handle non-axios errors", async () => {
      const { autopilotApi } = await import("../../lib/api/client");

      const genericError = new Error("Something went wrong");

      mockAxiosInstance.post.mockRejectedValueOnce(genericError);

      await expect(
        autopilotApi.sweepDust({
          wallet: "0x1234567890abcdef1234567890abcdef12345678",
        })
      ).rejects.toMatchObject({
        message: "Something went wrong",
        code: "UNKNOWN_ERROR",
        status: 500,
      });
    });

    it("should handle unknown thrown values", async () => {
      const { autopilotApi } = await import("../../lib/api/client");

      mockAxiosInstance.post.mockRejectedValueOnce("string error");

      await expect(
        autopilotApi.rebalance({
          wallet: "0x1234567890abcdef1234567890abcdef12345678",
        })
      ).rejects.toMatchObject({
        message: "An unknown error occurred",
        code: "UNKNOWN_ERROR",
        status: 500,
      });
    });

    it("should handle malformed backend response gracefully", async () => {
      const { autopilotApi } = await import("../../lib/api/client");

      // Backend returns unexpected structure
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: null,
      });

      const result = await autopilotApi.getStrategies("USDC");

      // Should not throw, returns whatever the server sent
      expect(result).toBeNull();
    });

    it("should handle empty strategies array", async () => {
      const { autopilotApi } = await import("../../lib/api/client");

      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          token: "RARE_TOKEN",
          chainId: 8453,
          strategies: [],
        },
      });

      const result = await autopilotApi.getStrategies("RARE_TOKEN");

      expect(result.strategies).toEqual([]);
      expect(result.strategies).toHaveLength(0);
    });

    it("should preserve original axios error in ApiError", async () => {
      const { autopilotApi, ApiError } = await import("../../lib/api/client");

      const axiosError = {
        isAxiosError: true,
        message: "Request failed",
        response: {
          status: 400,
          data: { error: "Test error" },
        },
        config: { url: "/ops/pay" },
      };

      mockAxiosInstance.post.mockRejectedValueOnce(axiosError);

      try {
        await autopilotApi.pay({
          wallet: "0x1234",
          to: "0x5678",
          token: "USDC",
          amount: "10",
        });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as InstanceType<typeof ApiError>).originalError).toBeDefined();
      }
    });

    it("should handle missing env vars with defaults", async () => {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
      delete process.env.NEXT_PUBLIC_API_TIMEOUT_MS;

      vi.resetModules();
      const { autopilotApi } = await import("../../lib/api/client");

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: "http://localhost:3001",
          timeout: 30000,
        })
      );

      // API should still be functional
      expect(autopilotApi).toBeDefined();
    });

    it("should handle invalid timeout env var", async () => {
      process.env.NEXT_PUBLIC_API_TIMEOUT_MS = "not-a-number";

      vi.resetModules();
      await import("../../lib/api/client");

      // parseInt("not-a-number") returns NaN, which will be used as timeout
      // The implementation uses parseInt which returns NaN for invalid input
      expect(axios.create).toHaveBeenCalled();
    });
  });

  describe("ApiError Class", () => {
    it("should export ApiError class", async () => {
      const { ApiError } = await import("../../lib/api/client");

      expect(ApiError).toBeDefined();

      const error = new ApiError("Test error", 400, "TEST_CODE");
      expect(error.message).toBe("Test error");
      expect(error.status).toBe(400);
      expect(error.code).toBe("TEST_CODE");
      expect(error.name).toBe("ApiError");
    });

    it("should default code to API_ERROR", async () => {
      const { ApiError } = await import("../../lib/api/client");

      const error = new ApiError("Test", 500);
      expect(error.code).toBe("API_ERROR");
    });

    it("should be an instance of Error", async () => {
      const { ApiError } = await import("../../lib/api/client");

      const error = new ApiError("Test", 500);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("Type Exports", () => {
    it("should export autopilotApi and ApiError", async () => {
      const clientModule = await import("../../lib/api/client");

      // Runtime existence check for exported values
      expect(clientModule.autopilotApi).toBeDefined();
      expect(clientModule.ApiError).toBeDefined();
      expect(clientModule.default).toBeDefined();
    });
  });
});
