'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {normalize,progress,playbackSession} = require('../episode-selector.js');

test('source and catalogue episodes normalize to identical shared cards', () => {
  const catalogue = {episodes:[{number:2,title:'Second',overview:'Story',still:'/still.jpg',runtime:42,available:false}]};
  const source = {data:{season:{episodes:[{episodeNumber:2,name:'Second',overview:'Story',stillPath:'/still.jpg',runtime:42,hasVideo:false},{episodeNumber:3,isPublished:false}]}}};
  assert.deepEqual(normalize(catalogue),normalize(source));
});
test('progress uses measured playback duration and clamps invalid values', () => {
  assert.equal(progress({time:30,duration:60}),.5);
  assert.equal(progress({time:90,duration:60}),1);
  assert.equal(progress({time:-1,duration:60}),0);
  assert.equal(progress({time:1,duration:Infinity}),0);
  assert.equal(progress({}),0);
});
for (const paused of [true,false]) {
  test(`overlay dismissal preserves ${paused ? 'paused' : 'playing'} state`, () => {
    let calls = 0;
    const video = {paused,isConnected:true,pause(){this.paused=true;calls++;},play(){this.paused=false;calls++;return Promise.resolve();}};
    const session = playbackSession(video);
    session.close(); assert.equal(calls,0);
    video.paused = !paused; session.close();
    assert.equal(video.paused,paused); assert.equal(calls,1);
  });
}
