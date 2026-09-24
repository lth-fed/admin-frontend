import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	defaultTransferGroupUpdates,
	defaultTransferGroups,
	hasDefaultTransferGroups,
	updatedDefaultTransferGroups
} from './transfer-settings.ts';

function kind(buyers: string[], recipients: string[], minimum = 0, visibility = false) {
	return {
		allowed_group_ids: buyers,
		transfer_group_ids: recipients,
		min_tickets: minimum,
		for_visibility: visibility
	};
}

test('ordinary defaults include all buyer groups, but not visibility-only access', () => {
	const ordinary = kind(['a'], ['b', 'a']);
	const kinds = [ordinary, kind(['b'], ['b'], 2), kind(['visibility'], [], 0, true)];
	assert.deepEqual(defaultTransferGroups(ordinary, kinds), ['a', 'b']);
	assert.equal(hasDefaultTransferGroups(ordinary, kinds), true);
	assert.deepEqual(defaultTransferGroups(kinds[1], kinds), ['b']);
});

test('adding and deleting a buyer kind updates only previous defaults', () => {
	const ordinary = kind(['a'], ['a']);
	const custom = kind(['a'], ['custom']);
	const allocated = kind(['a'], ['a'], 1);
	const before = [ordinary, custom, allocated];
	const after = [...before, kind(['b'], ['a', 'b'])];
	assert.deepEqual(updatedDefaultTransferGroups(ordinary, before, after), ['a', 'b']);
	assert.equal(updatedDefaultTransferGroups(custom, before, after), undefined);
	assert.equal(updatedDefaultTransferGroups(allocated, before, after), undefined);
	const expanded = { ...ordinary, transfer_group_ids: ['a', 'b'] };
	assert.deepEqual(updatedDefaultTransferGroups(expanded, after, before), ['a']);
});

test('adding a ticket preserves existing customized recipients', () => {
	const standard = { ...kind(['a'], ['a', 'b']), ticket_kind_id: 'standard' };
	const customized = { ...kind(['b'], ['b']), ticket_kind_id: 'customized' };
	const created = { ...kind(['c'], ['c']), ticket_kind_id: 'created' };
	const before = [standard, customized];
	const updates = defaultTransferGroupUpdates(before, [...before, created], created.ticket_kind_id);

	assert.deepEqual([...updates], [['standard', ['a', 'b', 'c']]]);
	assert.equal(updates.has('customized'), false);
	assert.equal(updates.has('created'), false);
});

test('custom empty recipients remain custom and visibility kinds are never synchronized', () => {
	const custom = kind(['a'], []);
	const visibility = kind(['a'], ['a'], 0, true);
	assert.equal(
		updatedDefaultTransferGroups(custom, [custom], [custom, kind(['b'], [])]),
		undefined
	);
	assert.equal(
		updatedDefaultTransferGroups(visibility, [visibility], [kind(['b'], [])]),
		undefined
	);
});

test('allocated defaults follow their own buyers and group comparison ignores duplicates', () => {
	const allocated = kind(['a', 'a'], ['a'], 1);
	assert.equal(hasDefaultTransferGroups(allocated, [allocated]), true);
	assert.deepEqual(defaultTransferGroups({ ...allocated, allowed_group_ids: ['b'] }, [allocated]), [
		'b'
	]);
	assert.equal(updatedDefaultTransferGroups(allocated, [allocated], [allocated]), undefined);
});

test('an edited default can move between ordinary and allocated defaults', () => {
	const other = kind(['other'], ['own'], 1);
	const before = [kind(['own'], ['own', 'other']), other];
	const edited = kind(['own'], ['own', 'other'], 1);
	assert.equal(hasDefaultTransferGroups(before[0], before), true);
	assert.deepEqual(defaultTransferGroups(edited, [edited, other]), ['own']);
});
