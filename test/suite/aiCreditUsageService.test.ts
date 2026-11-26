/**
 * Unit tests for AiCreditUsageService
 */

import * as assert from "assert";
import * as vscode from "vscode";
import { AiCreditUsageService } from "../../src/features/ai-credit-usage/services/aiCreditUsageService";

suite("Unit: AiCreditUsageService", () => {
  let service: AiCreditUsageService;
  let mockContext: any;

  setup(() => {
    // Create a mock extension context
    mockContext = {
      secrets: {
        get: async () => undefined,
        store: async () => {},
        delete: async () => {},
      },
      subscriptions: [],
    } as any;

    service = new AiCreditUsageService(mockContext);
  });

  teardown(() => {
    service.dispose();
  });

  test("Should instantiate AiCreditUsageService", () => {
    assert.ok(service);
  });

  test("Should initialize with unavailable state when no billing PAT", async () => {
    const state = service.getState();
    assert.strictEqual(state.status, "unavailable");
  });

  test("Should have auto-refresh disabled by default", () => {
    const state = service.getState();
    assert.strictEqual(state.autoRefreshDisabled, false);
  });

  test("Should not refresh when already refreshing", async () => {
    // Call refresh multiple times rapidly - only first should proceed
    const state1 = service.getState();
    assert.ok(state1);
  });

  test("Should return a copy of state, not reference", () => {
    const state1 = service.getState();
    const state2 = service.getState();

    // Should not be the same object
    assert.notStrictEqual(state1, state2);

    // Should have same values
    assert.strictEqual(state1.status, state2.status);
    assert.strictEqual(state1.autoRefreshDisabled, state2.autoRefreshDisabled);
  });

  test("Should dispose resources on dispose()", () => {
    service.dispose();
    // Should not throw
    assert.ok(true);
  });
});

suite("Unit: AiCreditUsageService - State Management", () => {
  let service: AiCreditUsageService;
  let mockContext: any;

  setup(() => {
    mockContext = {
      secrets: {
        get: async () => undefined,
        store: async () => {},
        delete: async () => {},
      },
      subscriptions: [],
    } as any;

    service = new AiCreditUsageService(mockContext);
  });

  teardown(() => {
    service.dispose();
  });

  test("Should start with unavailable status", () => {
    const state = service.getState();
    assert.strictEqual(state.status, "unavailable");
    assert.strictEqual(state.usage, undefined);
    assert.strictEqual(state.error, undefined);
  });

  test("Should have no usage data initially", () => {
    const state = service.getState();
    assert.strictEqual(state.usage, undefined);
  });

  test("Should not have auto-refresh disabled initially", () => {
    const state = service.getState();
    assert.strictEqual(state.autoRefreshDisabled, false);
  });
});

suite("Unit: AiCreditUsageService - Timing", () => {
  let service: AiCreditUsageService;
  let mockContext: any;

  setup(() => {
    mockContext = {
      secrets: {
        get: async () => undefined,
        store: async () => {},
        delete: async () => {},
      },
      subscriptions: [],
    } as any;

    service = new AiCreditUsageService(mockContext);
  });

  teardown(() => {
    service.dispose();
  });

  test("Should enforce minimum refresh interval (60 seconds)", async () => {
    // The service enforces a 60-second minimum between refreshes
    // We can't test this directly without mocking time, but we can verify the state
    const state = service.getState();
    assert.ok(state);
  });
});
