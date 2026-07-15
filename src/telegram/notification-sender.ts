import type { OutboundNotification } from "../core/types.js";
import type { NotificationSender } from "../dispatcher/notification-dispatcher.js";
import { notificationActionKeyboard, renderNotification } from "./render.js";
import type { TelegramApi } from "./types.js";

export class TelegramNotificationSender implements NotificationSender {
  constructor(
    private readonly api: TelegramApi,
    private readonly chatId: number,
  ) {}

  async sendNotification(
    notification: OutboundNotification,
  ): Promise<{ readonly messageId: string }> {
    const message = await this.api.sendRichMessage(
      this.chatId,
      renderNotification(notification),
      null,
      notificationActionKeyboard(notification.source),
    );
    return { messageId: message.messageId };
  }
}
