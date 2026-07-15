import type { CanonicalTurnResult } from "../codex/app-server-client.js";
import type { GatewayLanguage } from "../core/i18n.js";
import type { CompletionSender } from "../dispatcher/dispatcher.js";
import { renderCompletion, taskActionKeyboard } from "./render.js";
import type { TelegramApi } from "./types.js";

export class TelegramCompletionSender implements CompletionSender {
  constructor(
    private readonly api: TelegramApi,
    private readonly chatId: number,
    private readonly language: GatewayLanguage = "zh",
  ) {}

  async sendCompletion(
    result: CanonicalTurnResult,
    _eventId: string,
  ): Promise<{ readonly messageId: string }> {
    const message = await this.api.sendRichMessage(
      this.chatId,
      renderCompletion(result, this.language),
      null,
      taskActionKeyboard(result.threadId, this.language),
    );
    return { messageId: message.messageId };
  }
}
