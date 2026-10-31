# Colony conflict: design (2026-10-31)

Branch `fight`. Agreed with Marek in conversation on 2026-10-31; he asked to plan and build straight away and tune afterwards. Builds on the life cycle (main spec §5.6).

## Goal
A colony's goal is to **survive and to control food and ground**. Fighting is a tool it uses when that is worth it, never the point. The player watches; nothing is controlled by hand.

Signs it works, on a normal two-colony run:
- at any moment, fewer than about 1 in 10 ants are fighting;
- most deaths are old age and hunger, except when food is scarce;
- with plenty of food both colonies usually survive, with a slowly moving border;
- when food runs low, fights become more common and borders move faster;
- no rival walks through a nest any more.

## Pieces

### 1. Health and wounds
- Each ant has `wounds` beside `energy`. **Health = energy − wounds** (0–100). The ant dies when health reaches 0.
- Wounds heal slowly anywhere (`WOUND_HEAL`, per second) and fast while the ant is at its own nest (`NEST_HEAL`).
- Cause of death: **fight** if the ant was bitten in the last 5 s, else **hunger**; **old age** as before. Each colony counts `diedInFight` beside `diedOfAge` and `diedOfHunger`.

### 2. Bodies are food
- Every ant that dies leaves a **body** where it fell, worth `CORPSE_FOOD` (2) food, plus whatever it was carrying.
- Any forager of any colony that sees a body picks it up whole and carries it home like food; delivering it adds its value to the stores. Carriers lay food trail as usual, so busy battlefields become scavenging spots.
- A body that nobody collects disappears after `CORPSE_LIFETIME` (120 s).
- A body is removed the moment it is picked up or expires, and dead ants leave the ant arrays at once, so nothing refers to them afterwards (an ant whose foe died simply stops fighting).
- Bodies live in their own small list with a bucket index rebuilt each tick, so many bodies do not slow the food search.

### 3. Warriors
- `WARRIOR_RATIO` (10%) of newborn and starting ants are warriors (stream `Warrior`). They are drawn larger, bite harder (`WARRIOR_DAMAGE` ×3) and take less damage (`WARRIOR_ARMOR` ×2).
- **Guarding:** a warrior walks its colony's food trails out and back (the busiest trails are the strongest, so that is where warriors gather), along the column's **edge**: of the trail cells it can smell it heads for those near `GUARD_EDGE` (0.5) of the strongest, keeping to one flank (by uid), so both sides of a column are guarded (Marek, 2026-10-31). It never picks up food and lays no trail. At a food pile it turns for home; at the nest it turns out again.
- **Look:** warriors have their own sprite: a smaller gaster, a broad armoured head and long curved jaws, drawn 1.7x a worker's size.
- Warriors are pulled hard by their colony's battle smell; workers only weakly (§5).

### 4. How fights start, grow and stop
Each ant looks at its surroundings at the start of the tick (a pass before Think, so the result does not depend on ant order): sisters and rivals within `ODDS_RADIUS`, the nearest rival, and whose ground it stands on (the colony whose trail owns the cell; **contested** when both colonies' trails are strong there).

**Triggers**
- **Guards meet:** a warrior that sees a rival warrior within `ENGAGE_RADIUS` squares up to it. This is the main trigger: it happens where two colonies' guarded columns run close.
- **Trespass:** a warrior attacks any rival on its own ground.
- **Raid on the nest:** inside a nest's **safety ring** (`nestRadius × NEST_GUARD_FACTOR`, so it grows with the colony), every rival is a raider. Warriors and workers both attack it, and workers need no numbers advantage there.
- **Blocked worker:** a worker heading out for food fights a rival only if it is right in front of it, on own or contested ground, and the worker has backup (`WORKER_ODDS` sisters per rival). Otherwise it goes around.
- **Self-defence:** any ant that is bitten fights back, unless the odds tell it to run.
- Carriers never start fights.

**Standoff first.** A fight begins as a standoff (`STANDOFF_TIME`, 3 s): the two face each other and nobody is hurt. Each keeps counting its side. If it is clearly outnumbered (`rivals > (sisters + 1) × RETREAT_ODDS × courage`) it backs off and nobody dies. If the standoff lasts, it turns into biting. Inside a safety ring the defenders skip the standoff.

**Fighting.** Fighters close in and bite (`BITE_DPS`, scaled by role). Every fighter leaves **battle smell** on its cell.

**Battle smell.** A third scent channel per colony. It fades fast (`BATTLE_HALF_LIFE` 8 s, so it is gone about 30 s after the fighting stops), it does not count for ground ownership and it is not erased by rivals.
- A warrior answers it if its own boldness passes `WARRIOR_CALL × courage` (0.35: most warriors stay on guard) and it can smell the battle from where it is: only part of the warriors come; the rest keep guarding.
- A worker heading out answers it only rarely (`WORKER_CALL × courage`).
- Other workers treat it as danger: it lowers the score of their trail cells (`BATTLE_AVERSION`, less when the colony is stressed), so they take another way if there is one and push through if there is not.

**Stopping, one ant at a time.** A fighter breaks off and heads home when its health falls below `RETREAT_HEALTH`, when it is very hungry, when it is outnumbered, or when its foe is gone or out of reach. A retreating ant does not start fights for `RETREAT_TIME`.

**Stopping, whole colony.** Through mood and fear (§6): a colony that has lost many ants becomes careful, and a colony with full stores is calm and avoids fights.

### 5. Nest is solid to rivals
A rival ant cannot enter another colony's nest: the collision pass pushes it back out to the nest edge, like a wall.

### 6. Mood and fear
Each ant carries two feelings, 0 to 1, built only from what it experiences itself:
- **Stress (hunger mood).** Rises when a meal at home comes up short (the share it could not eat), and slowly while the ant is hungry. Falls after a full meal and when it delivers food.
- **Fear.** Rises when it is bitten and when a sister dies in a fight nearby (`FEAR_RADIUS`). Fades over about a minute.
- **Shared at the nest.** Each colony keeps a nest mood and a nest fear. An ant at its nest moves its feelings part of the way toward the nest's, and nudges the nest's a little toward its own, so the colony's feelings blend like food shared mouth to mouth.
- **Courage** = `1 + BOLD_STRESS × stress − FEAR_DAMP × fear`, kept within 0–2. Courage scales who answers the call, who engages, and how bad the odds must be before an ant runs. Hunger makes a colony bold; losses make it careful; the two are kept apart so a starving colony does not fight to the last ant.

### 7. On screen
- Warriors are drawn 1.7× larger, with their own big-headed, long-jawed sprite.
- The settings drawer has a Fighting group: warriors among newborns, warriors answering a fight, guards keep to column edge, workers that fight back, bite strength, retreat below health, battle smell half-life.
- Bodies are drawn as dark ants lying where they fell; a carried body is drawn at the mandibles.
- Zoomed in, a wounded ant shows a small health bar above it.
- The inspector shows role, health, wounds, stress, fear and fight state.

## Switch
`conflict` (default on in this branch) gates everything above. Off, the game runs as before; the legacy checksum test turns it off.

## Parameters (defaults, to be tuned)
| Name | Default | Meaning |
|---|---|---|
| `conflict` | on | master switch |
| `warriorRatio` | 0.1 | share of ants born warriors |
| `warriorDamage` / `warriorArmor` | 3 / 2 | bite and toughness multipliers |
| `biteDps` | 8 | health per second a worker's bite takes |
| `biteReach` | 3 u | gap at which ants can bite |
| `engageRadius` / `oddsRadius` / `loseRadius` | 24 / 32 / 48 u | |
| `nestGuardFactor` | 4 | safety ring = nest radius × this |
| `standoffTime` / `retreatTime` | 3 / 6 s | |
| `retreatOdds` / `workerOdds` | 1.5 / 2 | |
| `retreatHealth` | 0.35 | share of 100 |
| `warriorCall` / `workerCall` / `workerEngage` | 0.35 / 0.1 / 0.5 | shares of ants that respond |
| `guardEdge` | 0.5 | where a guard walks across a column: 0 middle, toward 1 the faint edge |
| `battleHalfLife` / `battleAversion` / `battleDetectMin` | 8 s / 0.5 / 0.05 | |
| `woundHeal` / `nestHeal` | 0.3 / 3 per s | |
| `corpseFood` / `corpseLifetime` | 2 / 120 s | |
| `mealStress` / `deliverCalm` / `hungerStress` | 0.5 / 0.05 / 0.02 per s | |
| `nestMix` / `nestAbsorb` | 0.2 / 0.02 | |
| `fearPerDamage` / `sisterDeathFear` / `fearRadius` / `fearDecay` | 0.01 / 0.15 / 48 u / 0.02 per s | |
| `boldStress` / `fearDamp` | 0.8 / 1.5 | |

## Build steps
1. Health, wounds, bodies as food (+ tests).
2. Warriors guarding trails (+ tests).
3. Look-around pass, standoffs, biting, battle smell, retreat, nest defence and solid nests (+ tests).
4. Mood and fear (+ tests).
5. Drawing and inspector.
6. Two-colony runs: share of ants fighting, deaths by cause, both colonies alive while food lasts; tune.
