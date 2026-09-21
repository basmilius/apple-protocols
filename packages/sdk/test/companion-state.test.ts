import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { CompanionLinkState } from '../src/internal/companion-link-state';

test('power subscriptions survive initial fetch and unrelated registration failures', async () => {
    const interests: string[] = [];
    const protocol = {
        stream: new EventEmitter(),
        context: {logger: {warn() {}}},
        registerInterests(events: string[]) {
            interests.push(...events);
            if (events[0] === '_iMC') throw new Error('Unrelated registration failure');
        },
        async getAttentionState() { throw new Error('No request handler'); },
        async fetchMediaControlStatus() {}
    };
    const state = new CompanionLinkState(protocol as any);
    state.subscribe();
    await state.fetchInitialState();
    assert.ok(interests.includes('SystemStatus'));
    assert.ok(interests.includes('TVSystemStatus'));
    protocol.stream.emit('TVSystemStatus', {state: '3'});
    assert.equal(state.attentionState, 'awake');
    for (const payload of [null, {}, {state: 'garbage'}, {state: 3.5}, {state: 999}]) {
        protocol.stream.emit('TVSystemStatus', payload);
        assert.equal(state.attentionState, 'awake');
    }
    protocol.stream.emit('SystemStatus', {state: 1});
    assert.equal(state.attentionState, 'asleep');
});
