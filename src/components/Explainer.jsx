export default function Explainer() {
  return (
    <details className="explain">
      <summary>What am I looking at?</summary>
      <div className="body">
        <p>
          Every server and every key is fed through a hash function that produces a number between{' '}
          <code>0</code> and <code>2^32-1</code>. That range is bent into a circle, so the number
          after the largest wraps back round to zero. The outer band is that circle; the inner dots
          are the keys.
        </p>
        <p>
          A key belongs to <b>the first server position at or clockwise of the key's own
          position</b>. That single rule is the whole algorithm. The coloured band shows which
          server owns which stretch of ring, and the small ticks are the individual server points.
        </p>
        <p>
          <b>Why this beats <code>hash(key) % N</code>:</b> modulo bakes the server count into
          every answer, so changing N recomputes every key. On the ring, a server's position
          depends only on its own name, so adding or removing one disturbs only the keys sitting
          in front of it.
        </p>
        <p>
          <b>What replication adds:</b> real stores keep several copies of every key,
          on the next few <i>distinct</i> servers clockwise. Turn it up and a failure stops
          being about loss and starts being about repair: nothing goes dark, the new primary
          is a server that already held the data, and the only real cost is re-making enough
          copies to get back to the target count.
        </p>
        <p>
          <b>Why virtual nodes:</b> with one point per server, a server owns one big arc &mdash;
          and a few random points never divide a circle evenly, so the load is lopsided before
          anything even fails. Worse, when that server dies, its single arc merges into exactly one
          neighbour. Giving each server 150 scattered points fixes both: many small arcs average
          out to near-equal shares, and when a server dies its slivers fall to many different
          neighbours instead of one.
        </p>
      </div>
    </details>
  );
}
