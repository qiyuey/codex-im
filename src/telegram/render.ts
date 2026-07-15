import { basename } from "node:path";
import type { CanonicalTurnResult, WatchedThreadSnapshot } from "../codex/app-server-client.js";
import type { ToolRequestUserInputQuestion } from "../codex/protocol/v2/ToolRequestUserInputQuestion.js";
import type { NotificationSource, OutboundNotification } from "../core/types.js";
import {
  escapeRichMarkdownText,
  prepareRichMarkdown,
  richMarkdownInlineCode,
} from "./rich-markdown.js";
import type { TelegramInlineButton } from "./types.js";

export const THREAD_PICKER_CALLBACK_DATA = "threads";
export const TASK_SWITCH_CALLBACK_PREFIX = "switch:";

export function renderCompletion(result: CanonicalTurnResult): string {
  const icon = result.status === "completed" ? "✅" : result.status === "interrupted" ? "⏹" : "❌";
  const body = result.finalMessage.trim() || "No final agent message was returned.";
  const shortThread = result.threadId.slice(0, 8);
  const duration = formatDuration(result.durationMs);
  const context =
    `**Project:** ${richMarkdownInlineCode(projectLabel(result.cwd))} · ` +
    `**Thread:** ${richMarkdownInlineCode(shortThread)}` +
    `${duration ? ` · **Duration:** ${escapeRichMarkdownText(duration)}` : ""}`;
  return prepareRichMarkdown(
    `# ${icon} Task ${escapeRichMarkdownText(statusHeading(result.status))}\n\n` +
      `${body}\n\n---\n\n${context}`,
  );
}

export function renderStreaming(text: string, done: boolean): string {
  const body = text.trim() || (done ? "No final agent message was returned." : "Codex is working…");
  return prepareRichMarkdown(`${done ? "✅" : "⏳"}\n\n${body}`);
}

export function renderNotification(notification: OutboundNotification): string {
  const source =
    notification.source.kind === "notification_only"
      ? "\n\n> ℹ️ 这是一条独立通知，未关联可继续对话的 Codex 任务。如需跟进，请点击下方“选择任务”，再发送一条新消息。"
      : "";
  return prepareRichMarkdown(
    `# 📬 ${escapeRichMarkdownText(notification.title)}\n\n` +
      `${notification.message.trim()}\n\n---\n\n` +
      `**Project:** ${richMarkdownInlineCode(projectLabel(notification.cwd))}` +
      source,
  );
}

export function notificationActionKeyboard(
  source: NotificationSource,
): readonly (readonly TelegramInlineButton[])[] {
  return source.kind === "bound_task"
    ? [taskSwitchButtonRow(source.codexThreadId)]
    : [[{ text: "选择任务", callbackData: THREAD_PICKER_CALLBACK_DATA }]];
}

export function renderWatchedBlocked(snapshot: WatchedThreadSnapshot): string {
  const body =
    snapshot.latestTurn?.finalMessage.trim() ||
    snapshot.blockedGoal?.objective.trim() ||
    "The watched Codex task is blocked.";
  return prepareRichMarkdown(
    `# ⚠️ Task blocked\n\n` +
      `${body}\n\n---\n\n` +
      `**Project:** ${richMarkdownInlineCode(projectLabel(snapshot.cwd))} · ` +
      `**Thread:** ${richMarkdownInlineCode(snapshot.threadId.slice(0, 8))}`,
  );
}

export function taskActionKeyboard(threadId: string): readonly (readonly TelegramInlineButton[])[] {
  return [
    [...taskSwitchButtonRow(threadId), { text: "停止通知", callbackData: `mute:${threadId}` }],
  ];
}

export function taskSwitchKeyboard(threadId: string): readonly (readonly TelegramInlineButton[])[] {
  return [taskSwitchButtonRow(threadId)];
}

function taskSwitchButtonRow(threadId: string): readonly TelegramInlineButton[] {
  return [{ text: "切换到此任务", callbackData: `${TASK_SWITCH_CALLBACK_PREFIX}${threadId}` }];
}

export function renderUserInputQuestion(input: {
  readonly threadId: string;
  readonly cwd: string;
  readonly question: ToolRequestUserInputQuestion;
  readonly index: number;
  readonly total: number;
}): string {
  const options = input.question.options
    ?.map(
      (option, index) =>
        `${index + 1}. ${limitText(option.label, 120)} — ${limitText(option.description, 400)}`,
    )
    .join("\n");
  return (
    `🟡 Codex needs input\nStatus: Waiting for input\n` +
    `Project: ${limitText(projectLabel(input.cwd), 120)}\n` +
    `Thread: ${limitText(input.threadId.slice(0, 8), 100)}\n\n` +
    `${limitText(input.question.header, 120)} (${input.index + 1}/${input.total})\n` +
    `${limitText(input.question.question, 1_200)}` +
    `${options ? `\n\n${options}` : ""}\n\n` +
    `Choose an option, or reply to this message with a custom answer.`
  );
}

export function renderUserInputAnswered(
  question: ToolRequestUserInputQuestion,
  answer: string,
): string {
  return (
    `✅ Input sent to Codex\n\n` +
    `${limitText(question.header, 120)}\n` +
    `${limitText(question.question, 1_200)}\n\n` +
    `Answer: ${limitText(answer, 1_000)}`
  );
}

function statusHeading(status: CanonicalTurnResult["status"]): string {
  if (status === "completed") return "completed";
  if (status === "interrupted") return "stopped";
  if (status === "failed") return "failed";
  return "running";
}

function projectLabel(cwd: string): string {
  return basename(cwd) || cwd;
}

function formatDuration(durationMs: number | null | undefined): string | null {
  if (durationMs === null || durationMs === undefined || durationMs < 0) return null;
  if (durationMs < 1_000) return `${Math.round(durationMs)}ms`;
  const seconds = Math.round(durationMs / 1_000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function limitText(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
}
