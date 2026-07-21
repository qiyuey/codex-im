import type { CanonicalTurnResult } from "../codex/app-server-client.js";
import { GATEWAY_PROTOCOL_VERSION } from "../core/build-info.js";
import type { CompletionEventStore } from "../storage/event-store.js";
import type { DeliveryTarget, GatewayStateStore } from "../storage/gateway-state-store.js";

export interface CompletionSender {
  sendCompletion(
    result: CanonicalTurnResult,
    eventId: string,
  ): Promise<{ readonly messageId: string }>;
}

export interface CompletionReader {
  readTurn(threadId: string, turnId: string): Promise<CanonicalTurnResult>;
}

export class Dispatcher {
  constructor(
    private readonly events: CompletionEventStore,
    private readonly state: GatewayStateStore,
    private readonly appServer: CompletionReader,
    private readonly sender: CompletionSender,
    private readonly target: DeliveryTarget,
    private readonly workspaceAllowed: (cwd: string) => Promise<boolean> = async () => true,
  ) {}

  async runOnce(now = Date.now()): Promise<boolean> {
    const event = this.events.leaseNext({ now, leaseDurationMs: 60_000 });
    if (!event?.leaseToken) return false;

    try {
      if (event.ingress.protocolVersion !== GATEWAY_PROTOCOL_VERSION) {
        this.events.markFailed(
          event.id,
          event.leaseToken,
          `unsupported ingress protocol ${event.ingress.protocolVersion}`,
          { maxAttempts: 1 },
        );
        return true;
      }
      if (this.state.hasSentDelivery(event.id, this.target)) {
        this.events.markDelivered(event.id, event.leaseToken);
        return true;
      }
      if (
        this.state.getTerminalDeliveryMessageId(
          this.target,
          event.codexThreadId,
          event.codexTurnId,
        ) ||
        this.state.isThreadMuted(this.target, event.codexThreadId)
      ) {
        this.events.markDelivered(event.id, event.leaseToken);
        return true;
      }
      const result = await this.appServer.readTurn(event.codexThreadId, event.codexTurnId);
      if (result.status === "in_progress") throw new Error("Codex turn is still in progress");
      const isAutomation =
        event.payload.threadSource === "automation" || result.threadSource === "automation";
      if (isAutomation && !this.isExplicitlyWatched(result.threadId)) {
        this.events.markDelivered(event.id, event.leaseToken);
        return true;
      }
      if (!(await this.workspaceAllowed(result.cwd))) {
        this.events.markFailed(event.id, event.leaseToken, "workspace not allowed", {
          maxAttempts: 1,
        });
        return true;
      }
      // Reading the turn can race with the direct Telegram reply path finishing
      // and recording its edited placeholder. Re-check immediately before send
      // so the Stop Hook completion does not emit the same final answer again.
      if (
        this.state.getTerminalDeliveryMessageId(this.target, event.codexThreadId, event.codexTurnId)
      ) {
        this.events.markDelivered(event.id, event.leaseToken);
        return true;
      }
      const sent = await this.sender.sendCompletion(result, event.id);
      this.state.recordSentDelivery(event.id, this.target, sent.messageId, {
        threadId: result.threadId,
        turnId: result.turnId,
      });
      this.events.markDelivered(event.id, event.leaseToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : "delivery failed";
      this.events.markFailed(event.id, event.leaseToken, message);
      process.stderr.write(
        `${JSON.stringify({ level: "warn", event: "completion_delivery_failed", eventId: event.id })}\n`,
      );
    }
    return true;
  }

  private isExplicitlyWatched(threadId: string): boolean {
    return (
      this.state.getThreadWatch(this.target.channel, this.target.chatId, this.target.topicId)
        ?.codexThreadId === threadId
    );
  }
}
