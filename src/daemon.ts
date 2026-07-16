#!/usr/bin/env node
import { AppServerClient } from "./codex/app-server-client.js";
import { loadRuntimeConfig } from "./config/runtime-config.js";
import { Dispatcher } from "./dispatcher/dispatcher.js";
import { NotificationDispatcher } from "./dispatcher/notification-dispatcher.js";
import { ThreadWatchMonitor } from "./dispatcher/thread-watch-monitor.js";
import { LocalKillSwitch } from "./security/kill-switch.js";
import { isWorkspaceAllowed } from "./security/workspace.js";
import { CompletionEventStore } from "./storage/event-store.js";
import { GatewayStateStore } from "./storage/gateway-state-store.js";
import { OutboundNotificationStore } from "./storage/notification-store.js";
import { openEventStore } from "./storage/open-store.js";
import { TelegramCompletionSender } from "./telegram/completion-sender.js";
import { GrammyTelegramAdapter } from "./telegram/grammy-adapter.js";
import { TelegramNotificationSender } from "./telegram/notification-sender.js";
import { TelegramService } from "./telegram/telegram-service.js";

async function main(): Promise<void> {
  const config = loadRuntimeConfig();
  const { database } = openEventStore();
  const events = new CompletionEventStore(database);
  const notifications = new OutboundNotificationStore(database);
  const state = new GatewayStateStore(database);
  const appServer = new AppServerClient();
  const telegram = new GrammyTelegramAdapter(
    config.telegramBotToken,
    config.telegramAllowedUserId,
    config.language,
  );
  const killSwitch = new LocalKillSwitch();
  const service = new TelegramService(config, telegram, state, appServer, 750, () =>
    killSwitch.isInboundEnabled(),
  );
  const sender = new TelegramCompletionSender(
    telegram,
    config.telegramAllowedChatId,
    config.language,
  );
  const dispatcher = new Dispatcher(
    events,
    state,
    appServer,
    sender,
    {
      channel: "telegram",
      chatId: String(config.telegramAllowedChatId),
    },
    (cwd) => isWorkspaceAllowed(cwd, config.allowedWorkspaces),
  );
  const notificationDispatcher = new NotificationDispatcher(
    notifications,
    new TelegramNotificationSender(telegram, config.telegramAllowedChatId, config.language),
    (cwd) => isWorkspaceAllowed(cwd, config.allowedWorkspaces),
    {
      findDeliveredMessageId: (notification) =>
        state.getTerminalDeliveryMessageId(
          { channel: "telegram", chatId: String(config.telegramAllowedChatId) },
          notification.source.codexThreadId,
          notification.source.codexTurnId,
        ),
      recordDelivered: (notification, messageId) => {
        state.recordTerminalDelivery(
          { channel: "telegram", chatId: String(config.telegramAllowedChatId) },
          notification.source.codexThreadId,
          notification.source.codexTurnId,
          "explicit_notification",
          notification.id,
          messageId,
        );
      },
    },
  );
  const threadWatchMonitor = new ThreadWatchMonitor(
    state,
    appServer,
    telegram,
    (cwd) => isWorkspaceAllowed(cwd, config.allowedWorkspaces),
    5_000,
    config.language,
  );

  let dispatching = false;
  let dispatchPromise: Promise<void> | null = null;
  let stopping = false;
  let stopPromise: Promise<void> | null = null;
  await appServer.connect();
  await threadWatchMonitor.initializeExistingSelections();
  await telegram.configureCommandMenu(config.telegramAllowedChatId);
  telegram.onMessage((message) => service.handleMessage(message));
  telegram.onCallbackQuery((query) => service.handleCallbackQuery(query));

  const interval = setInterval(() => {
    if (dispatching || stopping) return;
    dispatching = true;
    dispatchPromise = drainDispatchers(dispatcher, notificationDispatcher, threadWatchMonitor)
      .catch(() => undefined)
      .finally(() => {
        dispatching = false;
        dispatchPromise = null;
      });
  }, config.dispatchIntervalMs);

  const stop = (): Promise<void> => {
    if (stopPromise) return stopPromise;
    stopping = true;
    clearInterval(interval);
    stopPromise = telegram.stop().catch(() => {
      process.stderr.write(`${JSON.stringify({ level: "warn", event: "telegram_stop_failed" })}\n`);
    });
    return stopPromise;
  };
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());

  process.stdout.write(`${JSON.stringify({ level: "info", event: "gateway_started" })}\n`);
  try {
    await telegram.start();
  } finally {
    await stop();
    await dispatchPromise;
    await service.drain();
    await appServer.close();
    database.close();
    process.stdout.write(`${JSON.stringify({ level: "info", event: "gateway_stopped" })}\n`);
  }
}

async function drainDispatchers(
  dispatcher: Dispatcher,
  notificationDispatcher: NotificationDispatcher,
  threadWatchMonitor: ThreadWatchMonitor,
): Promise<void> {
  for (let processed = 0; processed < 20; processed += 1) {
    const notificationProcessed = await notificationDispatcher.runOnce();
    const completionProcessed = await dispatcher.runOnce();
    if (!completionProcessed && !notificationProcessed) break;
  }
  await threadWatchMonitor.runOnce();
}

await main().catch((error: unknown) => {
  const kind = error instanceof Error ? error.name : "UnknownError";
  process.stderr.write(`${JSON.stringify({ level: "error", event: "gateway_crashed", kind })}\n`);
  process.exitCode = 1;
});
