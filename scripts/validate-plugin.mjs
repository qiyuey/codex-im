import { access, readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(".codex-plugin/plugin.json", "utf8"));
const hookConfig = JSON.parse(await readFile("hooks/hooks.json", "utf8"));
const deliverySkill = await readFile("skills/telegram-delivery/SKILL.md", "utf8");
const builtMcpServer = await readFile("dist/mcp/server.js", "utf8");
const builtDaemon = await readFile("dist/daemon.js", "utf8");
const builtStopHook = await readFile("dist/hooks/stop.js", "utf8");

assert(manifest.name === "codex-im-gateway", "manifest name must match the plugin directory");
assert(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.version), "invalid version");
assert(
  typeof manifest.description === "string" && manifest.description.length > 0,
  "missing description",
);
assert(typeof manifest.author?.name === "string", "missing author.name");
assert(manifest.skills === "./skills/", "skills must use the plugin-relative directory");
assert(manifest.mcpServers === "./.mcp.json", "MCP config path is invalid");

await Promise.all([
  access(".mcp.json"),
  access("hooks/hooks.json"),
  access("skills/gateway/SKILL.md"),
  access("skills/telegram-delivery/SKILL.md"),
]);

assert(deliverySkill.includes("telegram_deliver"), "delivery skill must name the MCP tool");
assert(deliverySkill.includes("exactly once"), "delivery skill must require one final enqueue");
assert(
  deliverySkill.includes("GFM-compatible Rich"),
  "delivery skill must define Rich Markdown input",
);
assert(builtMcpServer.includes("telegram_deliver"), "built MCP server is missing delivery tool");
assert(
  builtDaemon.includes("sendRichMessage") && builtDaemon.includes("rich_message"),
  "built daemon is missing Telegram Rich Message delivery",
);
const stopHook = hookConfig.hooks?.Stop?.[0]?.hooks?.[0];
assert(stopHook?.type === "command", "missing Stop command hook");
assert(stopHook.command.includes("CODEX_IM_GATEWAY_DATA_DIR"), "Stop hook data dir is not shared");
assert(stopHook.command.includes("$PLUGIN_ROOT"), "Stop hook must resolve from PLUGIN_ROOT");
assert(
  stopHook.commandWindows.includes("CODEX_IM_GATEWAY_DATA_DIR"),
  "Windows Stop hook data dir is not shared",
);
assert(builtStopHook.includes("unable to queue completion event"), "built Stop hook is missing");

process.stdout.write("Plugin structure is valid.\n");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
