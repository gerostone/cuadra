import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listingsInCell, CELL } from '../public/demo.js';

test('los avisos de ejemplo son deterministas y caen dentro de su celda', () => {
  const all = [];
  for (let cx = -48710; cx < -48690; cx++) all.push(...listingsInCell(cx, -28824));
  assert.ok(all.length > 0);
  assert.deepEqual(listingsInCell(-48700, -28824), listingsInCell(-48700, -28824));
  for (const p of all) {
    assert.ok(p.op === 'venta' || p.op === 'alquiler');
    assert.equal(p.source, 'demo');
    assert.ok(p.lat >= -28824 * CELL && p.lat <= -28823 * CELL);
  }
});
