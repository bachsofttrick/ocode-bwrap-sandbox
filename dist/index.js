const DEFAULT_AGENTS = ["auto"];
const DEFAULT_WRITABLE = ["/tmp/opencode"];
const shellQuote = (value) => `'${value.replaceAll("'", `'\\''`)}'`;
const BwrapSandbox = async ({ client, directory, worktree, $ }, options = {}) => {
    const agents = options.agents ?? DEFAULT_AGENTS;
    const writable = [...(options.writable ?? DEFAULT_WRITABLE)];
    let bwrapAvailable = true;
    try {
        await $ `which bwrap`.quiet();
    }
    catch {
        bwrapAvailable = false;
        await client.app.log({
            body: {
                service: "bwrap-sandbox",
                level: "error",
                message: "bwrap is not installed; sandboxed bash calls will fail closed. Install bubblewrap.",
            },
        });
    }
    const buildPrefix = () => {
        const roots = [...new Set([worktree, directory].filter((path) => !!path && path !== "/"))];
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
        ];
        return args.map(shellQuote).join(" ");
    };
    const agentBySession = new Map();
    await client.app.log({
        body: {
            service: "bwrap-sandbox",
            level: "info",
            message: `active for agents: ${agents.join(", ")}`,
            extra: { directory, worktree, writable },
        },
    });
    // chat.message and chat.params to get agent type
    return {
        "chat.message": async (input) => {
            if (input.agent)
                agentBySession.set(input.sessionID, input.agent);
        },
        "chat.params": async (input) => {
            agentBySession.set(input.sessionID, input.agent);
        },
        "tool.execute.before": async (input, output) => {
            if (input.tool.toLowerCase() !== "bash")
                return;
            const agent = agentBySession.get(input.sessionID);
            if (!agent || !agents.includes(agent))
                return;
            const command = output.args?.command;
            if (typeof command !== "string" || command.trim() === "")
                return;
            if (!bwrapAvailable) {
                throw new Error("bash blocked: this agent runs sandboxed via bwrap, but bwrap is not installed (install the bubblewrap package).");
            }
            output.args.command = `${buildPrefix()} -- bash -c ${shellQuote(command)}`;
        },
    };
};
export default BwrapSandbox;
//# sourceMappingURL=index.js.map