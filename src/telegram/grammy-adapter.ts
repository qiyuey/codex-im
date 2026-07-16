import { Bot, GrammyError, HttpError } from "grammy";
import { type GatewayLanguage, translate } from "../core/i18n.js";
import type {
  TelegramApi,
  TelegramCallbackQuery,
  TelegramInlineButton,
  TelegramMessage,
  TelegramMessageRef,
} from "./types.js";

export function telegramCommands(language: GatewayLanguage) {
  return [
    { command: "threads", description: translate(language, "commandThreads") },
    { command: "use", description: translate(language, "commandUse") },
    { command: "current", description: translate(language, "commandCurrent") },
    { command: "new", description: translate(language, "commandNew") },
    { command: "mute", description: translate(language, "commandMute") },
    { command: "unmute", description: translate(language, "commandUnmute") },
    { command: "detach", description: translate(language, "commandDetach") },
    { command: "stop", description: translate(language, "commandStop") },
  ] as const;
}

export const TELEGRAM_COMMANDS = telegramCommands("zh");

export class GrammyTelegramAdapter implements TelegramApi {
  private handler: ((message: TelegramMessage) => Promise<void>) | null = null;
  private callbackHandler: ((query: TelegramCallbackQuery) => Promise<void>) | null = null;

  constructor(
    token: string,
    private readonly allowedUserId: number,
    private readonly language: GatewayLanguage = "zh",
    private readonly bot: Bot = new Bot(token),
  ) {
    this.bot.on("message:text", async (context) => {
      const message = context.message;
      if (
        !this.handler ||
        !message.from ||
        message.chat.type !== "private" ||
        message.from.id !== this.allowedUserId ||
        message.chat.id !== this.allowedUserId
      )
        return;
      await this.handler({
        messageId: String(message.message_id),
        chatId: message.chat.id,
        chatType: message.chat.type,
        userId: message.from.id,
        topicId: message.message_thread_id === undefined ? null : String(message.message_thread_id),
        replyToMessageId:
          message.reply_to_message === undefined
            ? null
            : String(message.reply_to_message.message_id),
        isForwarded: message.forward_origin !== undefined,
        text: message.text,
      });
    });
    this.bot.on("callback_query:data", async (context) => {
      const query = context.callbackQuery;
      const message = query.message;
      if (
        !this.callbackHandler ||
        !message ||
        message.chat.type !== "private" ||
        query.from.id !== this.allowedUserId ||
        message.chat.id !== this.allowedUserId
      ) {
        await context.answerCallbackQuery();
        return;
      }
      await this.callbackHandler({
        queryId: query.id,
        chatId: message.chat.id,
        chatType: message.chat.type,
        userId: query.from.id,
        topicId:
          "message_thread_id" in message && message.message_thread_id !== undefined
            ? String(message.message_thread_id)
            : null,
        messageId: String(message.message_id),
        data: query.data,
      });
    });
    this.bot.catch(({ error }) => {
      const kind =
        error instanceof GrammyError
          ? "telegram_api"
          : error instanceof HttpError
            ? "telegram_http"
            : "telegram_unknown";
      process.stderr.write(
        `${JSON.stringify({ level: "error", event: "telegram_update_failed", kind })}\n`,
      );
    });
  }

  onMessage(handler: (message: TelegramMessage) => Promise<void>): void {
    this.handler = handler;
  }

  onCallbackQuery(handler: (query: TelegramCallbackQuery) => Promise<void>): void {
    this.callbackHandler = handler;
  }

  async configureCommandMenu(chatId: number): Promise<void> {
    await Promise.all([
      this.bot.api.setMyCommands(telegramCommands(this.language), {
        scope: { type: "chat", chat_id: chatId },
      }),
      this.bot.api.setChatMenuButton({
        chat_id: chatId,
        menu_button: { type: "commands" },
      }),
    ]);
  }

  async start(): Promise<void> {
    await this.bot.start({ allowed_updates: ["message", "callback_query"] });
  }

  async stop(): Promise<void> {
    await this.bot.stop();
  }

  async sendTextMessage(
    chatId: number,
    text: string,
    topicId?: string | null,
    inlineKeyboard?: readonly (readonly TelegramInlineButton[])[],
  ): Promise<TelegramMessageRef> {
    const message = await this.bot.api.sendMessage(
      chatId,
      text,
      messageOptions(topicId, inlineKeyboard),
    );
    return { chatId, messageId: String(message.message_id), topicId: topicId ?? null };
  }

  async sendRichMessage(
    chatId: number,
    markdown: string,
    topicId?: string | null,
    inlineKeyboard?: readonly (readonly TelegramInlineButton[])[],
  ): Promise<TelegramMessageRef> {
    const message = await this.bot.api.sendRichMessage(
      chatId,
      { markdown },
      messageOptions(topicId, inlineKeyboard),
    );
    return { chatId, messageId: String(message.message_id), topicId: topicId ?? null };
  }

  async editTextMessage(
    ref: TelegramMessageRef,
    text: string,
    inlineKeyboard?: readonly (readonly TelegramInlineButton[])[],
  ): Promise<void> {
    await this.bot.api.editMessageText(
      ref.chatId,
      Number(ref.messageId),
      text,
      editOptions(inlineKeyboard),
    );
  }

  async editRichMessage(
    ref: TelegramMessageRef,
    markdown: string,
    inlineKeyboard?: readonly (readonly TelegramInlineButton[])[],
  ): Promise<void> {
    await this.bot.api.editMessageText(
      ref.chatId,
      Number(ref.messageId),
      { markdown },
      editOptions(inlineKeyboard),
    );
  }

  async editMessageKeyboard(
    ref: TelegramMessageRef,
    inlineKeyboard: readonly (readonly TelegramInlineButton[])[],
  ): Promise<void> {
    await this.bot.api.editMessageReplyMarkup(
      ref.chatId,
      Number(ref.messageId),
      editOptions(inlineKeyboard),
    );
  }

  async answerCallbackQuery(queryId: string, text?: string): Promise<void> {
    await this.bot.api.answerCallbackQuery(queryId, text ? { text } : undefined);
  }
}

function messageOptions(
  topicId?: string | null,
  inlineKeyboard?: readonly (readonly TelegramInlineButton[])[],
) {
  return {
    ...(topicId ? { message_thread_id: Number(topicId) } : {}),
    ...editOptions(inlineKeyboard),
  };
}

function editOptions(inlineKeyboard?: readonly (readonly TelegramInlineButton[])[]) {
  return inlineKeyboard
    ? {
        reply_markup: {
          inline_keyboard: inlineKeyboard.map((row) =>
            row.map((button) => ({
              text: button.text,
              callback_data: button.callbackData,
            })),
          ),
        },
      }
    : {};
}
