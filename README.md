# BOOGAS: Egg Heist (prototype v0.1)

A Meeland.io-style caveman base raider built with **Three.js + Vite**.
Hatch dinos, earn **Dust**, steal from rival camps, and craft gear from what you find in the wild.

## Run
```bash
npm install
npm run dev        # http://localhost:5179
npm run build      # static build in dist/ (upload to any host, e.g. CrazyGames / itch.io)
npm test           # headless smoke test + screenshots in tools/shots (needs Chrome)
```

## Controls
| Key | Action |
|---|---|
| WASD / Mouse | Move / look (click the game to lock the mouse) |
| Space | Jump (you can't jump while carrying) |
| E | Buy an egg · **hold** to steal, gather, or open chests |
| Click / F | Bonk |
| C / Tab | Crafting |
| T | Treasures |
| G | Place a Vine Trap (inside your camp) |
| Q | Toggle graphics quality (**HIGH** post-processing vs **FAST**) |
| M | Mute |

## Code map
| File | What it does |
|---|---|
| `src/config.js` | **All balance and content**: items, nodes, eggs, dinos, recipes, gear, treasures |
| `src/assets.js` | Loads 61 CC0 GLBs, Poly Haven HDRI + terrain textures, GPU wind-swaying `InstancedMesh` chunking, and `SkeletonUtils` animated cloning |
| `src/character.js` | Booga GLB loader + procedural Mixamo bone animator (idle/walk/carry/bonk/stun) |
| `src/world.js` | Multi-texture splatted terrain shader, biomes, volcano + lava rivers, instanced foliage, ambient particles, HDRI sky + shadows |
| `src/camp.js` | Camps: bark-textured palisade, nests, boulder gate lock, totem, campfire + tent props, labels |
| `src/props.js` | Clearcoat eggs, rigged & animated CC0 dinosaurs, CC0 resource nodes, chests, dust sprites |
| `src/actors.js` | Actor physics/carrying/combat + `BotBrain` AI |
| `src/game.js` | Game loop, `EffectComposer` post-processing (4x MSAA + `UnrealBloomPass` + colour grading), interactions, economy, save/load |
| `src/ui.js` | HUD, minimap, crafting & treasure panels, toasts |
| `src/audio.js` | Synth SFX (no audio files) |
| `tools/fetch_assets.mjs` | Downloads CC0 3D models from Quaternius (via Poly Pizza CDN) into `public/models/cc0/` |
| `tools/fetch_polyhaven.mjs` | Downloads CC0 HDRI sky & seamless terrain textures from Poly Haven into `public/env/` |
| `tools/glb_shrink.py` | Shrinks GLB textures (`booga_rok.glb` 34 MB → 3.5 MB; 61 CC0 GLBs 40.7 MB → 8.0 MB) |

## Assets & Credits
- `public/models/booga_rok.glb`: `Boogas_Avatar_ROK.glb` with its textures downsized by `tools/glb_shrink.py`
- `public/assets/items|treasures|dust`: copied from `Crafting Items/` and `Dust drop/`
- `public/models/cc0/*.glb`: **CC0 1.0 Public Domain** 3D models by **Quaternius** (*Animated Dinosaur Pack*, *Stylized Nature MegaKit*, and biome props via Poly Pizza)
- `public/env/*`: **CC0 1.0 Public Domain** HDRI sky (`kloofendal_48d_partly_cloudy_puresky`) and seamless terrain textures by **Poly Haven**

## Next steps
1. **Real multiplayer**: authoritative Colyseus (or uWebSockets) server. Actions such as `buyEgg`, `steal`, `resolveHit`, `craft` and `completeHold` are already separate functions in `game.js`, so they can move to the server.
2. Rebirth system, cosmetics from treasures (hat, belt), mobile touch controls, and CrazyGames SDK (ads/invites).
