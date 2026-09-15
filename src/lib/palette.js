/**
 * Series colours for servers. Picked to stay distinguishable on the dark panel
 * and to avoid the amber used for interface chrome, so a server mark can never
 * be mistaken for a control. Moved keys flash white, which is deliberately not
 * in this list.
 */
const SERIES = [
  '#3b9ae1', // blue
  '#52c77e', // green
  '#d94f6a', // rose
  '#9b7fe8', // violet
  '#e07b39', // orange
  '#34c6c6', // teal
  '#b8c93b', // citron
  '#e85d9b', // magenta
];

/**
 * A server's colour is derived from its own id, not from its index in the list,
 * so removing server-2 never recolours server-3.
 */
export function serverColor(serverId) {
  const n = Number.parseInt(String(serverId).replace(/\D/g, ''), 10);
  return SERIES[(Number.isFinite(n) ? n - 1 : 0) % SERIES.length];
}

export const MOVED_COLOR = '#ffffff';
