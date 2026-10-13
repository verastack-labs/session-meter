# session-meter

A Claude Code mod that shows how much of your usage limits, context window and session you have used, so you can slow down, stop or start fresh before you hit a wall.

- **A pane**, opened with `/meter`: your 5-hour and 7-day usage windows with countdowns to their reset, how full the context window is, and this session's spend, tokens, turns, tool calls and running time.
- **A status-line entry**, always on: `5h 62% · ctx 41%`.
- **Warnings**: a toast when a usage window reaches 80% and 95%, and when context reaches 80%.

## Install

In a terminal Claude Code session (Claude Code 2.1.295 or newer):

```
/plugin install session-meter --marketplace verastack-labs/session-meter
```

Answer `y` to add the marketplace, then pick a scope.

## Use

```
/meter
```

opens the pane, and running it again closes it. Bars turn yellow at 80% and red at 95%.

## Limits

Usage windows appear only for accounts that report them, such as a Claude subscription; with an API key the pane says none are reported. Spend appears only when Claude Code reports a cost. Tokens, turns and tool calls count from when the mod loaded, and `/clear` starts them over.

## Development

```
claude plugin test .
claude plugin validate .
```

## Licence

Apache 2.0. See `LICENSE`.
