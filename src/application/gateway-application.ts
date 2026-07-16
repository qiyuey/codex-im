import type { RuntimeConfig } from "../config/runtime-config.js";
import type { TelegramCallbackQuery, TelegramMessage } from "../telegram/types.js";

interface AppServerLifecycle {
  connect(): Promise<unknown>;
  close(): Promise<void>;
}

interface TelegramRuntime {
  configureCommandMenu(chatId: number): Promise<void>;
  onMessage(handler: (message: TelegramMessage) => Promise<void>): void;
  onCallbackQuery(handler: (query: TelegramCallbackQuery) => Promise<void>): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

interface GatewayServiceRuntime {
  handleMessage(message: TelegramMessage): Promise<void>;
  handleCallbackQuery(query: TelegramCallbackQuery): Promise<void>;
  drain(): Promise<void>;
}

interface DispatcherRuntime {
  runOnce(): Promise<boolean>;
}

interface ThreadWatchRuntime {
  initializeExistingSelections(): Promise<void>;
  runOnce(): Promise<boolean>;
}

interface CloseableDatabase {
  close(): void;
}

interface RuntimeStatusLifecycle {
  start(): void;
  stop(): void;
}

interface InstanceLockLifecycle {
  acquire(): void;
  release(): void;
}

export interface GatewayApplicationDependencies {
  readonly config: RuntimeConfig;
  readonly database: CloseableDatabase;
  readonly appServer: AppServerLifecycle;
  readonly telegram: TelegramRuntime;
  readonly service: GatewayServiceRuntime;
  readonly dispatcher: DispatcherRuntime;
  readonly notificationDispatcher: DispatcherRuntime;
  readonly threadWatchMonitor: ThreadWatchRuntime;
  readonly runtimeStatus: RuntimeStatusLifecycle;
  readonly instanceLock: InstanceLockLifecycle;
}

export class GatewayApplication {
  private dispatching = false;
  private dispatchPromise: Promise<void> | null = null;
  private dispatchTimer: NodeJS.Timeout | null = null;
  private stopping = false;
  private shutdownReady = false;
  private stopPromise: Promise<void> | null = null;

  constructor(private readonly dependencies: GatewayApplicationDependencies) {}

  async run(): Promise<void> {
    const { appServer, config, instanceLock, runtimeStatus, telegram, threadWatchMonitor } =
      this.dependencies;
    instanceLock.acquire();
    try {
      await appServer.connect();
      if (this.stopping) return;
      await threadWatchMonitor.initializeExistingSelections();
      if (this.stopping) return;
      await telegram.configureCommandMenu(config.telegramAllowedChatId);
      telegram.onMessage((message) => this.dependencies.service.handleMessage(message));
      telegram.onCallbackQuery((query) => this.dependencies.service.handleCallbackQuery(query));
      this.startDispatchLoop();
      runtimeStatus.start();
      this.shutdownReady = true;
      process.stdout.write(`${JSON.stringify({ level: "info", event: "gateway_started" })}\n`);
      await telegram.start();
    } finally {
      this.shutdownReady = true;
      await this.stop();
      process.stdout.write(`${JSON.stringify({ level: "info", event: "gateway_stopped" })}\n`);
    }
  }

  stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    this.stopping = true;
    if (!this.shutdownReady) return Promise.resolve();
    if (this.dispatchTimer) clearInterval(this.dispatchTimer);
    this.dispatchTimer = null;
    this.stopPromise = this.shutdown();
    return this.stopPromise;
  }

  private startDispatchLoop(): void {
    this.dispatchTimer = setInterval(() => {
      if (this.dispatching || this.stopping) return;
      this.dispatching = true;
      this.dispatchPromise = this.drainDispatchers()
        .catch(() => undefined)
        .finally(() => {
          this.dispatching = false;
          this.dispatchPromise = null;
        });
    }, this.dependencies.config.dispatchIntervalMs);
  }

  private async shutdown(): Promise<void> {
    const { appServer, database, instanceLock, runtimeStatus, service, telegram } =
      this.dependencies;
    try {
      await telegram.stop().catch(() => {
        process.stderr.write(
          `${JSON.stringify({ level: "warn", event: "telegram_stop_failed" })}\n`,
        );
      });
      await this.dispatchPromise;
      await service.drain();
      await appServer.close();
    } finally {
      runtimeStatus.stop();
      database.close();
      instanceLock.release();
    }
  }

  private async drainDispatchers(): Promise<void> {
    const { dispatcher, notificationDispatcher, threadWatchMonitor } = this.dependencies;
    for (let processed = 0; processed < 20; processed += 1) {
      const notificationProcessed = await notificationDispatcher.runOnce();
      const completionProcessed = await dispatcher.runOnce();
      if (!completionProcessed && !notificationProcessed) break;
    }
    await threadWatchMonitor.runOnce();
  }
}
