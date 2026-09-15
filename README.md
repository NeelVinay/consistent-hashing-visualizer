# Consistent Hashing Scope

An interactive visualization of what actually happens to your keys when a server
joins or dies — comparing naive `hash(key) % N` against consistent hashing on a
ring, and showing why **virtual nodes** are the part that makes consistent
hashing work in practice.

**[▶ Live demo](https://neelvinay.github.io/consistent-hashing-visualizer/)**

Everything runs in the browser. No backend, no storage, no network calls.

---

## The problem it demonstrates

### 1. Naive modulo reshuffles almost everything

The obvious way to spread keys over N servers is `hash(key) % N`. It distributes
evenly, and it falls apart the moment N changes — because N is baked into every
single answer.

Going from 4 servers to 5, a key only stays put when `hash % 4` and `hash % 5`
happen to agree. By the Chinese Remainder Theorem that holds for exactly N of
every N(N+1) hash values, so precisely **1 in 5 keys stay and 80% move**. It is
not bad luck, it is arithmetic, and it gets worse as you grow: 9 → 10 servers
moves 90%. In a cache tier, every one of those keys is a miss.

Measured in the demo: **407 of 500 keys (81.4%) remap when a 5th server joins.**

### 2. Consistent hashing moves only what it must

Hash the servers onto the same `0 … 2³²-1` space, bend that range into a circle,
and give each key to the first server position at or clockwise of the key's own
position. A server's position now depends only on its own name, not on how many
other servers exist — so adding one disturbs only the keys sitting directly in
front of it.

Measured in the demo: **119 of 500 keys (23.8%) move when a 5th server joins,
and every one of them moves onto the new server.** No key is shuffled between
two servers that did not change.

### 3. …but one point per server is still broken

Here is the part that gets skipped. Put each server at a *single* point on the
ring and two things go wrong:

- **Before anything fails**, a handful of random points never divide a circle
  evenly. With 3 servers the demo measures a **642 / 262 / 96** split — the
  busiest server carries 6.7× the quietest.
- **When a server dies**, its one big arc merges into the one arc behind it.
  **100% of its keys land on a single neighbour** — which is now carrying its own
  load plus all of the dead server's, and is the next thing to fall over.

### 4. Virtual nodes fix both

Give each server ~150 positions instead of one, by hashing `server-2#0`,
`server-2#1`, and so on. Each server now owns many small scattered arcs.

| | load across 3 servers | failure of one absorbed by |
|---|---|---|
| **1 point each** | 642 / 262 / 96 (6.7× spread) | server-2 takes **100%** |
| **150 points each** | 385 / 317 / 298 (1.3× spread) | 53% / 47% across **both** |

## Why virtual nodes solve both problems

These look like one fix but they are two, and the distinction is the point.

**The imbalance problem is about averaging.** Three random cuts of a circle
produce wildly unequal arcs; the variance is enormous because you only drew three
samples. Draw 450 cuts instead and assign them to servers in equal numbers, and
each server's *total* arc converges on its fair share by the law of large
numbers. Virtual nodes do not make the individual arcs even — they are just as
random as before — they make each server hold enough of them that the sum
averages out.

**The redistribution problem is about adjacency.** When a server disappears, each
arc it owned is inherited by whoever owns the arc behind it. With one point per
server there is exactly one such neighbour, so the entire load transfers to one
machine no matter how many other servers are idle. With 150 points, the dead
server has 150 separate "arc behind it" relationships, and those neighbours are
drawn at random from every other server — so the load splits roughly evenly
across the whole cluster.

That second property is why this matters operationally: it means a node failure
degrades the cluster by a small uniform amount instead of cascading into the one
unlucky machine standing next to it.

## The hash function

FNV-1a (32-bit), **followed by MurmurHash3's `fmix32` avalanche step**
(`src/lib/hash.js`).

Cryptographic strength is irrelevant here — nothing is being authenticated or
hidden. Uniform distribution is the only requirement, since ring position *is*
the hash value.

The avalanche step is not decoration. Plain FNV-1a leaves its low bits poorly
diffused into its high bits, and the high bits are exactly what determine ring
position. On the 600 `server-N#i` strings this app generates, raw FNV-1a scored
**chi-square 108** across ten ring segments (uniform is ~9), with segments holding
between 21 and 107 points. Virtual nodes clumped like that cannot spread load
evenly no matter how many you add — it would have quietly defeated the whole
demonstration while still *looking* like it worked. Adding `fmix32` drops that to
**3.8**. There is a test asserting this so it cannot silently regress.

## Layout

The simulation is pure JavaScript with no React imports, so it can be tested
independently of anything on screen.

```
src/lib/                    the actual algorithm
  hash.js                   FNV-1a + avalanche; RING_SIZE = 2^32
  ring.js                   buildRing / lookup (binary search + wraparound) / assignConsistent
  naive.js                  assignNaive -- hash(key) % N
  simulation.js             diffAssignments, countPerServer, absorbedBy, imbalanceRatio
  geometry.js               ring position -> screen coordinates
  palette.js                per-server colours
src/components/             rendering only
  RingScope.jsx             the SVG ring
  StatsPanel.jsx            readouts and per-server load bars
  Controls.jsx              manual controls and the three guided scenarios
  Explainer.jsx             collapsible primer on the ring
```

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 44 tests over the simulation logic
npm run build
```

## Tests

`npm test` covers the hash's distribution, ring construction, clockwise lookup
including wraparound, and both add and remove scenarios. The interesting ones
assert the *mechanism*, not just the headline percentage:

- moved keys after an add are **exactly** the set now claimed by the new server
- no key moves between two servers that did not change
- a position past the highest ring point wraps to the lowest
- removing a server at 1 vnode leaves **exactly one** absorber
- removing a server at 150 vnodes leaves **every survivor** with a share
- `server-N#i` names hash uniformly enough for virtual nodes to work at all

## Notes

- Ring is `0x00000000`–`0xFFFFFFFF`, treated as circular.
- Lookup is a binary search over the sorted ring points; wraparound is the single
  "ran off the end, return the first point" fallback.
- Ring points that collide on the same integer break ties by label, so placement
  is deterministic across rebuilds.
- A server's colour derives from its own id, so removing `server-2` never
  recolours `server-3`.
