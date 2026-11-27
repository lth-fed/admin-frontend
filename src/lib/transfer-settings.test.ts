import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultTransferGroups, sameGroups } from './transfer-settings.ts';

test('extra ticket kinds default to the base ticket buyer groups, without duplicates', () => {
	assert.deepEqual(defaultTransferGroups(['a', 'b', 'a']), ['a', 'b']);
	assert.deepEqual(defaultTransferGroups([]), []);
});

test('group comparison ignores order and duplicates', () => {
	assert.equal(sameGroups(['a', 'b', 'a'], ['b', 'a']), true);
	assert.equal(sameGroups(['a'], ['a', 'b']), false);
});
