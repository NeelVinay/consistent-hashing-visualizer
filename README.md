# Consistent Hashing Scope

An interactive visualization of what actually happens to your keys when a server
joins or dies — comparing naive `hash(key) % N` against consistent hashing on a
ring, why **virtual nodes** are the part that makes it work, and what
**replication** changes about all of it.

**[▶ Live demo](https://neelvinay.github.io/consistent-hashing-visualizer/)**

Four guided steps build the argument in order. Everything runs in the browser —
no backend, no storage, no network calls.

---

## What this is, and what it isn't

`src/lib/` is a **real implementation of the consistent hashing algorithm**, not
a mockup of one. `buildRing`, `lookupReplicas` and `assignReplicas` are what a
cache client or a database's routing layer actually does to decide which node
owns a key. There are no React imports in that folder and no knowledge that a UI
exists; it could be lifted into a Node service and used to route real traffic.

What this is **not** is a distributed system. There is no network, no data, no
replication traffic, no failure detection, no coordination. Clicking "fail
server" doesn't fail anything — it recomputes a mapping instantly.

**The routing brain is real; the body around it is a simulation.**

---

## The argument, in four steps

### 1. Naive modulo reshuffles almost everything

`hash(key) % N` distributes evenly and falls apart the moment N changes, because
N is baked into every answer. Going from 4 servers to 5, a key stays put only
when `hash % 4` and `hash % 5` agree — by the Chinese Remainder Theorem that
holds for exactly N of every N(N+1) hash values, so precisely **1 in 5 stay and
80% move**. It is arithmetic, not bad luck, and it worsens with scale: 9 → 10
servers moves 90%.

> Measured: **407 of 500 keys (81.4%) remap when a 5th server joins.**

### 2. The ring fixes that — but one point per server is still broken

Hash servers onto the same `0 … 2³²-1` space, bend it into a circle, and give
each key to the first server position at or clockwise of the key's own position.
A server's position depends only on its own name, so adding one disturbs only
the keys in front of it.

> Measured: **119 of 500 keys (23.8%) move when a 5th server joins, and every
> one moves onto the new server.** No key is shuffled between two unchanged servers.

With a *single* point per server, though, two things are still wrong:

- **Before anything fails**, a handful of random points never divide a circle
  evenly — 3 servers measure a **642 / 262 / 96** split, a 6.7× spread.
- **When a server dies**, its one big arc merges into the one arc behind it.
  **100% of its keys land on a single neighbour**, which is now the next thing
  to fall over.

### 3. Virtual nodes fix both

Give each server ~150 positions instead of one, by hashing `server-2#0`,
`server-2#1`, and so on.

| | load across 3 servers | failure of one absorbed by |
|---|---|---|
| **1 point each** | 642 / 262 / 96 (6.7× spread) | server-2 takes **100%** |
| **150 points each** | 385 / 317 / 298 (1.3× spread) | 53% / 47% across **both** |

### 4. Replication changes what failure even means

Real stores keep several copies of every key, on the next R *distinct* servers
clockwise. Turning that on reframes everything above.

At **RF=1**, "133 keys moved to a new server" is a euphemism — the new server has
never seen them. For a cache that is a miss and a refetch; for a store it is data
loss. At **RF≥2** the same failure loses nothing.

> Measured, failing 1 of 6 servers at RF=3: **0 keys lost.** 91 keys need a new
> primary, and **every one of those is a promotion of a server that already held
> the data** — so reads never stop. The real cost is the **263 copies** the
> cluster must remake in the background to get back to 3.

Note the direction of that trade: replication does **not** reduce the repair
work, it increases it. What it buys is durability and instant failover.

## Why virtual nodes solve both problems

These look like one fix but they are two, and the distinction is the point.

**The imbalance problem is about averaging.** Three random cuts of a circle
produce wildly unequal arcs, because you only drew three samples. Draw 450 cuts
and assign them to servers in equal numbers, and each server's *total* arc
converges on its fair share by the law of large numbers. Virtual nodes don't make
individual arcs even — they're just as random — they make each server hold enough
of them that the sum averages out.

**The redistribution problem is about adjacency.** When a server disappears, each
arc it owned is inherited by whoever owns the arc behind it. With one point per
server there is exactly one such neighbour, so the whole load transfers to one
machine no matter how many others are idle. With 150 points, the dead server has
150 separate "arc behind it" relationships, drawn at random from every other
server — so the load splits roughly evenly across the cluster.

That second property is the operational one: a node failure degrades the cluster
by a small uniform amount instead of cascading into one unlucky machine.

## How this compares to real systems

**Naive modulo is not a strawman.** It's implemented exactly as real code does
it, and it is genuinely fine when N never changes — `user_id % 16` over a fixed
16 shards with planned manual resharding is a real, defensible design. Its
failure mode is specifically *elasticity*, which is what step 1 demonstrates.

**Faithful to real implementations:**

- Ring over a fixed integer space, servers placed by hashing their own names,
  clockwise-successor assignment, binary search over sorted points.
- Virtual nodes via hashing `serverID#i` — how libketama (the memcached client
  standard) does it.
- Replicas as the next R *distinct physical* servers clockwise, skipping repeat
  virtual nodes of a server already chosen — as in Dynamo-style stores.
- 150 vnodes/server is a realistic figure: libketama uses 160 points per server;
  Cassandra's `num_tokens` defaulted to 256 for years and is 16 in modern
  versions with its newer allocation algorithm.

**Deliberately simplified:**

| | here | real systems |
|---|---|---|
| Ring size | 32-bit | Cassandra 64-bit signed; Dynamo used 128-bit MD5 |
| Node weight | all equal | bigger machines get proportionally more vnodes |
| Token placement | pure random hashing | modern Cassandra computes tokens to minimize variance |
| Failure detection | a button | gossip / phi-accrual detectors |
| Data movement | instant recompute | streaming, minutes to hours, with hinted handoff |
| Ring membership | one variable | gossip or consensus; nodes disagree mid-transition |
| Rack/zone awareness | none | replicas deliberately placed in separate failure domains |

Also worth knowing: consistent hashing balances **key count, not traffic**. One
viral key still melts one node, and no number of virtual nodes fixes that.
Depending on the use case it has been partly superseded by **rendezvous (HRW)
hashing**, **jump consistent hash**, **Maglev hashing** for load balancers, and
**bounded-load consistent hashing** where hot keys matter.

## The hash function

FNV-1a (32-bit), **followed by MurmurHash3's `fmix32` avalanche step**
(`src/lib/hash.js`).

Cryptographic strength is irrelevant — nothing is authenticated or hidden.
Uniform distribution is the only requirement, since ring position *is* the hash.

The avalanche step is not decoration. Plain FNV-1a leaves its low bits poorly
diffused into its high bits, and the high bits determine ring position. On the
`server-N#i` strings this app generates, raw FNV-1a scored **chi-square 108**
across ten ring segments (uniform is ~9), with segments holding between 21 and
107 points. Virtual nodes clumped like that cannot spread load evenly no matter
how many you add — it would have quietly defeated the demonstration while still
*looking* like it worked. Adding `fmix32` drops that to **3.8**, and a test pins
it so it cannot silently regress.

## Layout

The simulation is pure JavaScript with no React imports, testable independently
of anything on screen.

```
src/lib/                    the actual algorithm
  hash.js                   FNV-1a + avalanche; RING_SIZE = 2^32
  ring.js                   buildRing / lookup / lookupReplicas / assignReplicas
  naive.js                  assignNaive, assignNaiveReplicas -- hash(key) % N
  simulation.js             diffReplicaSets, countStoredPerServer, copiesGainedBy,
                            keysWithoutSurvivingCopy, imbalanceRatio
  scenarios.js              the four guided steps, with computed headlines
  geometry.js               ring position -> screen coordinates
  palette.js                per-server colours
src/components/             rendering only
  RingScope.jsx             the SVG ring
  Scenarios.jsx             the four guided steps
  Controls.jsx              manual sandbox, collapsed by default
  StatsPanel.jsx            readouts and per-server load bars
  Explainer.jsx             collapsible primer
```

`assignConsistent`, `diffAssignments`, `countPerServer` and `absorbedBy` remain
as the single-copy primitives — the replicated functions are the general case and
collapse to exactly these at RF=1, which is asserted by test.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 60 tests over the simulation logic
npm run build
```

## Tests

The interesting ones assert the *mechanism*, not just the headline percentage:

- moved keys after an add are **exactly** the set now claimed by the new server
- no key moves between two servers that did not change
- a position past the highest ring point wraps to the lowest
- removing a server at 1 vnode leaves **exactly one** absorber
- removing a server at 150 vnodes leaves **every survivor** with a share
- replicas are always **distinct physical servers**, never the same one twice
- at RF≥2 a failure orphans **zero** keys; at RF=1 it orphans all of the dead
  server's
- RF=3 survives two simultaneous failures where RF=2 does not
- a promoted primary **always already held a copy** — never a cold server
- `server-N#i` names hash uniformly enough for virtual nodes to work at all
- replicated functions reproduce the unreplicated ones exactly at RF=1

## Notes

- Ring is `0x00000000`–`0xFFFFFFFF`, treated as circular.
- Lookup is a binary search over sorted ring points; wraparound is the single
  "ran off the end, return the first point" fallback.
- Ring points colliding on the same integer break ties by label, so placement is
  deterministic across rebuilds.
- A server's colour derives from its own id, so removing `server-2` never
  recolours `server-3`.
