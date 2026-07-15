import type { GatewayLanguage } from "../core/i18n.js";
import type { OutboundNotification } from "../core/types.js";
import type { NotificationSender } from "../dispatcher/notification-dispatcher.js";
import { notificationActionKeyboard, renderNotification } from "./render.js";
import type { TelegramApi } from "./types.js";

export class TelegramNotificationSender implements NotificationSender {
  constructor(
    private readonly api: TelegramApi,
    private readonly chatId: number,
    private readonly language: GatewayLanguage = "zh",
  ) {}

  async sendNotification(
    notification: OutboundNotification,
  ): Promise<{ readonly messageId: string }> {
    const message = await this.api.sendRichMessage(
      this.chatId,
      renderNotification(notification, this.language),
      null,
      notificationActionKeyboard(notification.source, this.language),
    );
    return { messageId: message.messageId };
  }
}
