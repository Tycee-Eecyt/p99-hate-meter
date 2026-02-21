# P99 Aggro Log Reader (Electron)

Electron UI that tracks aggro from:
- Flux staff clicks (50 hate each).
- Melee swings (hit or miss) using weapon damage + damage bonus.

## Setup
```bash
npm install
npm start
```

## Defaults (from your findings)
- Primary: Blade of Tactics (DMG 14, delay 24)
- Secondary: Swiftblade of Zek (DMG 11, delay 18)
- Level 60 damage bonus table applied to both hands

## Notes
- Use "Find Latest" to auto-select the newest EQ log in the folder.
- "Read From Start" will parse the entire file; otherwise it tails live.
- Use "Load Inventory" (or Start/Auto-start) to read `CharacterName-Inventory.txt` from your EverQuest base folder and auto-fill Primary/Secondary DMG+Delay.
