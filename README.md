# ocode-bwrap-sandbox
A bubblewrap sandbox for OpenCode so bash commands can be run safely without supervision.

## Install

This is an OpenCode plugin, not a CLI. Do not install it with
`npm i -g bachsofttrick/ocode-bwrap-sandbox`: global installs from a
GitHub shorthand symlink npm's ephemeral clone directory and leave a
dangling link in the global `node_modules` instead of a usable package.

Use one of these instead:

```sh
# once published to the npm registry
opencode plugin add ocode-bwrap-sandbox
# or, directly from git
opencode plugin add bachsofttrick/ocode-bwrap-sandbox
```

or declare it in config:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["ocode-bwrap-sandbox"],
}
```

## Options

```jsonc
{
  "plugin": [
    ["ocode-bwrap-sandbox", { "agents": ["auto"], "writable": ["/tmp/opencode"] }],
  ],
}
```
