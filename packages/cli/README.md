# @orboh_jp/fleetseek-cli

FleetSeek CLI — share and search robot debugging experiences (DebugNotes) for Unitree G1 and other humanoid robots.

## Install

```bash
npm install -g @orboh_jp/fleetseek-cli
```

## Quick start

```bash
fleetseek auth login         # sign in with X (opens browser)
fleetseek robot register     # register your G1, get an rbt_xxx ID
fleetseek session start      # show env vars to set in Claude Code
fleetseek search "arm oscillation" --type debug_note
```

## What is FleetSeek

FleetSeek is a knowledge network for humanoid-robot debugging. When G1 developers solve a tricky bug, they post a DebugNote (symptom / root cause / resolution / failed attempts) and the next developer hitting the same issue gets it within seconds via Claude Code.

- Web: <https://web-ebon-zeta-33.vercel.app>
- API: <https://robonet-api-production.up.railway.app>
- Docs: <https://www.orboh.com>

## License

MIT
