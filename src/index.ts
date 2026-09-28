import type { Plugin } from "@opencode-ai/plugin"
const DEFAULT_AGENTS = ["auto", "general", "mid-agent"]
const DEFAULT_WRITABLE = ["/tmp/opencode"]

// Sandboxes the bash tool with bwrap (bubblewrap) so commands can only
// write inside the project worktree (plus /tmp and optional extra paths).
// Everything else on the filesystem is mounted read-only.
//
// Applies only to sessions running one of the configured agents
// (default: the "auto" primary agent).
//
// Options via config tuple form:
//   ["./bwrap-sandbox", { agents: ["auto"], writable: ["~/.npm"] }]

type Options = {
  agents?: string[]
  writable?: string[]
}

const shellQuote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`

const WRAP_MARKER = " -- bash -c "

// Reverses shellQuote for a single-quoted shell argument. Returns null when the
// value is not a single-quoted argument, so callers can fall back to the input.
const shellUnquote = (value: string): string | null => {
  if (value.length < 2 || !value.startsWith("'") || !value.endsWith("'")) return null
  return value.slice(1, -1).replaceAll(`'\\''`, "'")
}

// Recover the direct command from a string already wrapped as
// `<bwrap args> -- bash -c <quoted command>`. Returns null when the string is
// not such a wrapper, so re-wrapping does not nest sandboxes.
const unwrapBwrap = (command: string): string | null => {
  const markerIndex = command.indexOf(WRAP_MARKER)
  if (markerIndex === -1) return null
  const prefix = command.slice(0, markerIndex)
  if (!prefix.includes("bwrap")) return null
  return shellUnquote(command.slice(markerIndex + WRAP_MARKER.length).trim())
}

const BwrapSandbox: Plugin = async ({ client, directory, worktree, $ }, options: Options = {}) => {
  const agents = options.agents ?? DEFAULT_AGENTS
  const writable = [...(options.writable ?? DEFAULT_WRITABLE)]

  let bwrapAvailable = true
  try {
    await $`which bwrap`.quiet()
  } catch {
    bwrapAvailable = false
    await client.app.log({
      body: {
        service: "bwrap-sandbox",
        level: "error",
        message: "bwrap is not installed; sandboxed bash calls will fail closed. Install bubblewrap.",
      },
    })
  }

  const buildPrefix = () => {
    const roots = [...new Set([worktree, directory].filter((path): path is string => !!path && path !== "/"))]
    const args = [
      "bwrap",
      "--ro-bind", "/", "/",
      "--tmpfs", "/tmp",
      ...roots.flatMap((root) => ["--bind", root, root]),
      ...writable.flatMap((path) => ["--bind", path, path]),
      "--die-with-parent",
      "--new-session",
      "--unshare-all",
      // --unshare-user puts the payload in its own user namespace and is
      // required by --disable-userns below. Without it, a payload holding
      // CAP_SYS_ADMIN in the parent namespace could unshare again.
      "--unshare-user",
      // --disable-userns denies creation of any further user namespace inside
      // the sandbox (bwrap caps /proc/sys/user/max_user_namespaces). Without
      // it, a nested `bwrap` could unshare its own user+mount namespace and
      // bind-mount a read-only path writable, escaping the sandbox.
      "--disable-userns",
      // --assert-userns-disabled makes bwrap abort unless the above denial is
      // actually in force, so the sandbox fails closed instead of silently
      // running with nested user namespaces still allowed.
      "--assert-userns-disabled",
      // --cap-drop ALL removes every capability from the payload. In a user
      // namespace the payload would otherwise regain CAP_SYS_ADMIN, enough to
      // unshare a mount namespace or call mount() and remount paths writable.
      "--cap-drop", "ALL",
      "--share-net"
    ]
    return args.map(shellQuote).join(" ")
  }

  const agentBySession = new Map<string, string>()

  await client.app.log({
    body: {
      service: "bwrap-sandbox",
      level: "info",
      message: `active for agents: ${agents.join(", ")}`,
      extra: { directory, worktree, writable },
    },
  })

  // chat.message and chat.params to get agent type
  return {
    "chat.message": async (input) => {
      if (input.agent) agentBySession.set(input.sessionID, input.agent)
    },
    "chat.params": async (input) => {
      agentBySession.set(input.sessionID, input.agent)
    },
    "tool.execute.before": async (input, output) => {
      if (input.tool.toLowerCase() !== "bash") return
      const agent = agentBySession.get(input.sessionID)
      if (!agent || !agents.includes(agent)) return

      const command = output.args?.command
      if (typeof command !== "string" || command.trim() === "") return

      if (!bwrapAvailable) {
        throw new Error(
          "bash blocked: this agent runs sandboxed via bwrap, but bwrap is not installed (install the bubblewrap package).",
        )
      }

      const direct = unwrapBwrap(command) ?? command
      output.args.command = `${buildPrefix()} -- bash -c ${shellQuote(direct)}`
    },
  }
}

export default BwrapSandbox;
