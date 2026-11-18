import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizedPointer, physicalPointer } from '../desktop/coordinates.mjs';
const layout = { hostId: 'synthetic-host-a', revision: 'layout-2', monitors: [
  { id: 'left', enabled: true, bounds: { x: -1024, y: 0, width: 1024, height: 768 }, scale: 1 },
  { id: 'main', enabled: true, bounds: { x: 0, y: 0, width: 1600, height: 900 }, scale: 1.25 },
] };
const input = (monitorId, u, v) => ({ hostId: layout.hostId, revision: layout.revision, monitorId, u, v });
test('negative monitor origins and full virtual-desktop coordinates stay within the intended monitor', () => {
  const left = physicalPointer(layout, input('left', 0, 0)), right = physicalPointer(layout, input('main', 1, 1));
  assert.equal(left.x, -1024); assert.equal(left.absoluteX, 0);
  assert.equal(right.x, 1599); assert.equal(right.y, 899); assert.equal(right.absoluteX, 65535); assert.equal(right.absoluteY, 65535);
  assert.equal(physicalPointer(layout, input('left', 1, 1)).x, -1);
});
test('scaled frames map to physical pixels without applying UI DPI a second time', () => {
  const pointer = normalizedPointer({ x: 400, y: 225 }, { x: 0, y: 0, width: 800, height: 450 }, { width: 800, height: 450 });
  const point = physicalPointer(layout, { ...input('main', 0, 0), ...pointer });
  assert.equal(point.x, 800); assert.equal(point.y, 450);
});
test('letterbox touches are ignored; zoom and pan transform only the selected view', () => {
  const viewport = { x: 10, y: 20, width: 400, height: 400 }, frame = { width: 1600, height: 900 };
  assert.equal(normalizedPointer({ x: 0, y: 220 }, viewport, frame, { zoom: 2 }), null);
  assert.equal(normalizedPointer({ x: 210, y: 25 }, viewport, frame), null);
  assert.deepEqual(normalizedPointer({ x: 210, y: 220 }, viewport, frame), { u: 0.5, v: 0.5 });
  assert.deepEqual(normalizedPointer({ x: 230, y: 210 }, viewport, frame, { zoom: 2, panX: 20, panY: -10 }), { u: 0.5, v: 0.5 });
});
test('wrong host, stale layout, disabled monitor and nonfinite coordinates fail closed', () => {
  assert.throws(() => physicalPointer(layout, { ...input('main', 0.5, 0.5), hostId: 'synthetic-host-b' }));
  assert.throws(() => physicalPointer(layout, { ...input('main', 0.5, 0.5), revision: 'old' }));
  assert.throws(() => physicalPointer(layout, input('missing', 0.5, 0.5)));
  assert.throws(() => physicalPointer(layout, input('main', Infinity, 0.5)));
  assert.throws(() => physicalPointer(layout, input('main', -0.1, 0.5)));
});
