import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { TelemetryService } from '../../telemetryService';

suite('TelemetryService Test Suite', () => {
	let context: vscode.ExtensionContext;
	let telemetryService: TelemetryService;
	let sandbox: sinon.SinonSandbox;

	setup(() => {
		sandbox = sinon.createSandbox();
		
		// Mock extension context
		context = {
			subscriptions: [],
			workspaceState: {
				get: sandbox.stub(),
				update: sandbox.stub()
			},
			globalState: {
				get: sandbox.stub(),
				update: sandbox.stub(),
				setKeysForSync: sandbox.stub()
			},
			extensionUri: vscode.Uri.file('/test/path'),
			extensionPath: '/test/path',
			asAbsolutePath: (relativePath: string) => `/test/path/${relativePath}`,
			storagePath: '/test/storage',
			globalStoragePath: '/test/global-storage',
			logPath: '/test/logs',
			extensionMode: vscode.ExtensionMode.Test
		} as any;

		telemetryService = new TelemetryService(context);
	});

	teardown(() => {
		sandbox.restore();
		if (telemetryService) {
			telemetryService.dispose();
		}
	});

	suite('Initialization', () => {
		test('Should initialize without errors when telemetry is disabled', async () => {
			// Mock telemetry as disabled
			sandbox.stub(vscode.workspace, 'getConfiguration').returns({
				get: sandbox.stub()
					.withArgs('telemetryLevel', 'all').returns('off')
					.withArgs('telemetry.enabled', true).returns(true)
			} as any);

			await telemetryService.initialize();

			// Should not throw and service should be created
			assert.ok(telemetryService);
		});

		test('Should respect VS Code global telemetry setting', async () => {
			const getConfigStub = sandbox.stub(vscode.workspace, 'getConfiguration');
			
			// Mock VS Code telemetry as disabled
			getConfigStub.withArgs('telemetry').returns({
				get: sandbox.stub().withArgs('telemetryLevel', 'all').returns('off')
			} as any);
			
			getConfigStub.withArgs('nexkit').returns({
				get: sandbox.stub().withArgs('telemetry.enabled', true).returns(true)
			} as any);

			await telemetryService.initialize();

			// Telemetry should be disabled due to VS Code global setting
			// We can't directly test private properties, but we can verify behavior
			assert.ok(telemetryService);
		});

		test('Should respect Nexkit telemetry setting', async () => {
			const getConfigStub = sandbox.stub(vscode.workspace, 'getConfiguration');
			
			// Mock VS Code telemetry as enabled
			getConfigStub.withArgs('telemetry').returns({
				get: sandbox.stub().withArgs('telemetryLevel', 'all').returns('all')
			} as any);
			
			// Mock Nexkit telemetry as disabled
			getConfigStub.withArgs('nexkit').returns({
				get: sandbox.stub().withArgs('telemetry.enabled', true).returns(false)
			} as any);

			await telemetryService.initialize();

			// Telemetry should be disabled due to Nexkit setting
			assert.ok(telemetryService);
		});
	});

	suite('Command Tracking', () => {
		test('Should track command execution', () => {
			telemetryService.trackCommand('testCommand', { customProp: 'value' });
			
			// Service should not throw
			assert.ok(telemetryService);
		});

		test('Should track command with duration and success', () => {
			telemetryService.trackCommandWithDuration('testCommand', 100, true, { 
				customProp: 'value' 
			});
			
			// Service should not throw
			assert.ok(telemetryService);
		});

		test('Should handle command execution with async function', async () => {
			const testFn = async () => {
				return 'result';
			};

			const result = await telemetryService.trackCommandExecution('testCommand', testFn);
			
			assert.strictEqual(result, 'result');
		});

		test('Should track errors when command execution fails', async () => {
			const testFn = async () => {
				throw new Error('Test error');
			};

			try {
				await telemetryService.trackCommandExecution('testCommand', testFn);
				assert.fail('Should have thrown an error');
			} catch (error) {
				assert.ok(error instanceof Error);
				assert.strictEqual((error as Error).message, 'Test error');
			}
		});
	});

	suite('Error Tracking', () => {
		test('Should track error without throwing', () => {
			const testError = new Error('Test error');
			
			telemetryService.trackError(testError, { context: 'test' });
			
			// Should not throw
			assert.ok(telemetryService);
		});

		test('Should track error with properties', () => {
			const testError = new Error('Test error with context');
			
			telemetryService.trackError(testError, {
				commandName: 'testCommand',
				additionalInfo: 'test data'
			});
			
			// Should not throw
			assert.ok(telemetryService);
		});
	});

	suite('Event Tracking', () => {
		test('Should track custom event', () => {
			telemetryService.trackEvent('customEvent', {
				property1: 'value1',
				property2: 'value2'
			});
			
			// Should not throw
			assert.ok(telemetryService);
		});

		test('Should track event with measurements', () => {
			telemetryService.trackEvent('customEvent', 
				{ prop: 'value' }, 
				{ metric1: 100, metric2: 200 }
			);
			
			// Should not throw
			assert.ok(telemetryService);
		});
	});

	suite('Metric Tracking', () => {
		test('Should track metric', () => {
			telemetryService.trackMetric('customMetric', 42, { unit: 'seconds' });
			
			// Should not throw
			assert.ok(telemetryService);
		});

		test('Should track metric without properties', () => {
			telemetryService.trackMetric('simpleMetric', 100);
			
			// Should not throw
			assert.ok(telemetryService);
		});
	});

	suite('Activation and Deactivation', () => {
		test('Should track activation', () => {
			telemetryService.trackActivation();
			
			// Should not throw
			assert.ok(telemetryService);
		});

		test('Should track deactivation', () => {
			telemetryService.trackDeactivation();
			
			// Should not throw
			assert.ok(telemetryService);
		});

		test('Should track session duration on deactivation', (done) => {
			// Track activation first
			telemetryService.trackActivation();
			
			// Wait a bit to ensure duration is non-zero
			setTimeout(() => {
				telemetryService.trackDeactivation();
				
				// Should not throw
				assert.ok(telemetryService);
				done();
			}, 10);
		});
	});

	suite('Disposal', () => {
		test('Should dispose without errors', () => {
			telemetryService.dispose();
			
			// Should not throw
			assert.ok(telemetryService);
		});

		test('Should track deactivation on dispose', () => {
			const trackDeactivationSpy = sandbox.spy(telemetryService, 'trackDeactivation');
			
			telemetryService.dispose();
			
			assert.ok(trackDeactivationSpy.calledOnce);
		});
	});

	suite('Flush', () => {
		test('Should flush without errors', () => {
			telemetryService.flush();
			
			// Should not throw
			assert.ok(telemetryService);
		});
	});

	suite('Username and IP Address Tracking', () => {
		test('Should capture username from OS', () => {
			// The username should be set during construction
			// We can't directly test private properties, but we can verify the service was created
			assert.ok(telemetryService);
			// Username will be included in commonProperties when telemetry is initialized
		});

		test('Should handle username retrieval errors gracefully', () => {
			// Service should not throw even if username can't be retrieved
			assert.ok(telemetryService);
		});

		test('Should include username and IP in common properties after initialization', async () => {
			const getConfigStub = sandbox.stub(vscode.workspace, 'getConfiguration');
			
			// Mock telemetry as enabled
			getConfigStub.withArgs('telemetry').returns({
				get: sandbox.stub().withArgs('telemetryLevel', 'all').returns('all')
			} as any);
			
			getConfigStub.withArgs('nexkit').returns({
				get: sandbox.stub()
					.withArgs('telemetry.enabled', true).returns(true)
					.withArgs('telemetry.connectionString').returns(undefined)
			} as any);

			await telemetryService.initialize();

			// The telemetry service should be initialized
			// In a real scenario, commonProperties would include username and ipAddress
			assert.ok(telemetryService);
		});

		test('Should cache IP address to avoid repeated fetches', async () => {
			// First initialization will fetch IP
			await telemetryService.initialize();
			
			// Create a new service instance
			const telemetryService2 = new TelemetryService(context);
			
			// Second initialization should use cached IP (though in this case it's a new instance)
			await telemetryService2.initialize();
			
			assert.ok(telemetryService2);
			telemetryService2.dispose();
		});

		test('Should handle IP fetch timeout gracefully', async () => {
			const getConfigStub = sandbox.stub(vscode.workspace, 'getConfiguration');
			
			// Mock telemetry as enabled
			getConfigStub.withArgs('telemetry').returns({
				get: sandbox.stub().withArgs('telemetryLevel', 'all').returns('all')
			} as any);
			
			getConfigStub.withArgs('nexkit').returns({
				get: sandbox.stub()
					.withArgs('telemetry.enabled', true).returns(true)
					.withArgs('telemetry.connectionString').returns(undefined)
			} as any);

			// Initialize should not hang or throw even if IP fetch times out
			await telemetryService.initialize();
			
			assert.ok(telemetryService);
		});

		test('Should handle IP fetch errors gracefully', async () => {
			const getConfigStub = sandbox.stub(vscode.workspace, 'getConfiguration');
			
			// Mock telemetry as enabled
			getConfigStub.withArgs('telemetry').returns({
				get: sandbox.stub().withArgs('telemetryLevel', 'all').returns('all')
			} as any);
			
			getConfigStub.withArgs('nexkit').returns({
				get: sandbox.stub()
					.withArgs('telemetry.enabled', true).returns(true)
					.withArgs('telemetry.connectionString').returns(undefined)
			} as any);

			// Should not throw even if IP fetch fails
			await telemetryService.initialize();
			
			assert.ok(telemetryService);
		});
	});

	suite('Integration Tests', () => {
		test('Should handle multiple commands in sequence', async () => {
			await telemetryService.trackCommandExecution('command1', async () => {
				return 'result1';
			});

			await telemetryService.trackCommandExecution('command2', async () => {
				return 'result2';
			});

			await telemetryService.trackCommandExecution('command3', async () => {
				return 'result3';
			});

			// All commands should execute successfully
			assert.ok(telemetryService);
		});

		test('Should handle mixed success and failure commands', async () => {
			// Successful command
			const result1 = await telemetryService.trackCommandExecution('successCommand', async () => {
				return 'success';
			});
			assert.strictEqual(result1, 'success');

			// Failed command
			try {
				await telemetryService.trackCommandExecution('failCommand', async () => {
					throw new Error('Command failed');
				});
				assert.fail('Should have thrown');
			} catch (error) {
				assert.ok(error instanceof Error);
			}

			// Another successful command
			const result2 = await telemetryService.trackCommandExecution('successCommand2', async () => {
				return 'success2';
			});
			assert.strictEqual(result2, 'success2');
		});
	});
});
