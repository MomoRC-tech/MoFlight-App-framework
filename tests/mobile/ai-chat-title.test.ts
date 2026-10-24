import test from 'node:test';
import assert from 'node:assert/strict';
import {chatDraftTitle} from '../../apps/platform-lab/src/ai/chat-model.ts';
test('new local conversation titles follow an unsent question while later drafts retain the existing history title',()=>{
 assert.equal(chatDraftTitle('  August flights?\nOnly saved records.'),'August flights?');
 assert.equal(chatDraftTitle('Edited question',{title:'Old draft',messages:[]}), 'Edited question');
 assert.equal(chatDraftTitle('',{title:'Keep title',messages:[]}), 'Keep title');
 assert.equal(chatDraftTitle('x'.repeat(16000)).length,80);
 assert.equal(chatDraftTitle('Next question',{title:'First question',messages:[{} as never]}),'First question');
});
