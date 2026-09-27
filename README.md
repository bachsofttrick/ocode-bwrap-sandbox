# ocode-bwrap-sandbox
A bubblewrap sandbox for OpenCode so bash commands can be run safely without supervision.

## Attention
Below is how this package is supposed to be installed. But after many tries, I couldn't get it to work in `npm i -g` way. So to install this plugin, just copy `src/index.ts` into `~/.config/opencode/plugins` and rename into `bwrap-sandbox.ts`.

## Install

This is an OpenCode plugin, not a CLI. Install it with
`npm i -g bachsofttrick/ocode-bwrap-sandbox`, or use one of these instead:

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
