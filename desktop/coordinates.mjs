// Shared geometry only. This module neither captures screens nor injects input.
const finite = value => typeof value === 'number' && Number.isFinite(value);
const rectangle = value => value && ['x', 'y', 'width', 'height'].every(key => finite(value[key])) && value.width > 0 && value.height > 0;
export function normalizedPointer(point, viewport, frame, { zoom = 1, panX = 0, panY = 0 } = {}) {
  if (!finite(point?.x) || !finite(point?.y) || !rectangle(viewport) || !finite(frame?.width) || !finite(frame?.height) || frame.width <= 0 || frame.height <= 0 || !finite(zoom) || zoom <= 0 || !finite(panX) || !finite(panY)) throw new Error('Invalid display geometry.');
  if (point.x < viewport.x || point.x > viewport.x + viewport.width || point.y < viewport.y || point.y > viewport.y + viewport.height) return null;
  const scale = Math.min(viewport.width / frame.width, viewport.height / frame.height) * zoom;
  const width = frame.width * scale, height = frame.height * scale;
  if (!finite(width) || !finite(height) || width <= 0 || height <= 0) throw new Error('Invalid scaled frame geometry.');
  const left = viewport.x + (viewport.width - width) / 2 + panX, top = viewport.y + (viewport.height - height) / 2 + panY;
  const u = (point.x - left) / width, v = (point.y - top) / height;
  // Letterboxing is not part of the remote screen. Never clamp it into a click.
  return u < 0 || u > 1 || v < 0 || v > 1 ? null : { u, v };
}
export function physicalPointer(layout, input) {
  if (!layout || typeof layout.hostId !== 'string' || !layout.hostId || typeof layout.revision !== 'string' || !layout.revision || input?.hostId !== layout.hostId || input?.revision !== layout.revision) throw new Error('Host or monitor layout changed. Refresh before controlling it.');
  if (!Array.isArray(layout.monitors) || !layout.monitors.length) throw new Error('No monitor layout is available.');
  const monitors = layout.monitors.filter(monitor => monitor.enabled !== false);
  if (new Set(monitors.map(monitor => monitor.id)).size !== monitors.length || monitors.some(monitor => typeof monitor.id !== 'string' || !monitor.id || !rectangle(monitor.bounds) || !Object.values(monitor.bounds).every(Number.isSafeInteger) || Math.abs(monitor.bounds.x) > 100000 || Math.abs(monitor.bounds.y) > 100000 || monitor.bounds.width > 100000 || monitor.bounds.height > 100000)) throw new Error('Invalid monitor layout.');
  const monitor = monitors.find(monitor => monitor.id === input.monitorId);
  if (!monitor || !finite(input.u) || !finite(input.v) || input.u < 0 || input.u > 1 || input.v < 0 || input.v > 1) throw new Error('Pointer is outside the selected monitor.');
  const x = monitor.bounds.x + Math.round(input.u * (monitor.bounds.width - 1));
  const y = monitor.bounds.y + Math.round(input.v * (monitor.bounds.height - 1));
  const left = Math.min(...monitors.map(m => m.bounds.x)), top = Math.min(...monitors.map(m => m.bounds.y));
  const right = Math.max(...monitors.map(m => m.bounds.x + m.bounds.width)), bottom = Math.max(...monitors.map(m => m.bounds.y + m.bounds.height));
  return { hostId: layout.hostId, monitorId: monitor.id, revision: layout.revision, x, y,
    virtualDesktop: { x: left, y: top, width: right - left, height: bottom - top },
    absoluteX: Math.round((x - left) * 65535 / Math.max(1, right - left - 1)),
    absoluteY: Math.round((y - top) * 65535 / Math.max(1, bottom - top - 1)) };
}
