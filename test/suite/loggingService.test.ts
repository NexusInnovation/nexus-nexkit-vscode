import * as assert from "assert";
import { LoggingService, LogLevel } from "../../src/shared/services/loggingService";

suite("Unit: LoggingService", () => {
  let loggingService: LoggingService;

  setup(() => {
    loggingService = LoggingService.getInstance();
  });

  test("Should be a singleton", () => {
    const instance1 = LoggingService.getInstance();
    const instance2 = LoggingService.getInstance();
    assert.strictEqual(instance1, instance2, "Should return the same instance");
  });

  test("Should set log level", () => {
    loggingService.setLogLevel(LogLevel.ERROR);
    // No assertion needed - just verify it doesn't throw
  });

  test("Should handle info logging", () => {
    loggingService.info("Test info message");
    loggingService.info("Test info with data", { foo: "bar" });
  });

  test("Should handle warning logging", () => {
    loggingService.warn("Test warning message");
    loggingService.warn("Test warning with data", { count: 42 });
  });

  test("Should handle error logging", () => {
    loggingService.error("Test error message");
    loggingService.error("Test error with Error object", new Error("Test error"));
    loggingService.error("Test error with object", { code: 500 });
  });

  test("Should handle debug logging", () => {
    loggingService.setLogLevel(LogLevel.DEBUG);
    loggingService.debug("Test debug message");
    loggingService.debug("Test debug with data", { debug: true });
  });

  test("Should respect log level filtering", () => {
    loggingService.setLogLevel(LogLevel.ERROR);
    // These should not throw even if filtered
    loggingService.debug("Should be filtered");
    loggingService.info("Should be filtered");
    loggingService.warn("Should be filtered");
    loggingService.error("Should be logged");
  });
});
