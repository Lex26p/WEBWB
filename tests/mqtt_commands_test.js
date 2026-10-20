/* WEBWB: offline checks for MQTT commands; no real broker required. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

class Socket {
  static OPEN = 1;
  static all = [];
  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.readyState = 0;
    this.sent = [];
    Socket.all.push(this);
  }
  send(packet) { this.sent.push(new Uint8Array(packet)); }
  open() { this.readyState = 1; this.onopen?.(); }
  receive(bytes) { this.onmessage?.({data:new Uint8Array(bytes).buffer}); }
  close() { this.readyState = 3; this.onclose?.(); }
}
const window = {};
const ctx = vm.createContext({window, WebSocket:Socket, URL, Uint8Array, ArrayBuffer,
  TextEncoder, TextDecoder, Math, setTimeout, clearTimeout, setInterval, clearInterval});
function load(file) {
  const filename = path.join(__dirname, '..', 'frontend', file);
  vm.runInContext(fs.readFileSync(filename, 'utf8'),ctx,{filename});
}
load('js/mqtt_reader.js');
load('js/model.js');
const mqtt = window.WBPanelMQTT;
const topic = '/devices/demo/controls/Relay/on';
const states = [];
const reader = mqtt.createReader({url:'ws://test/',topics:[],allowCommands:true,onState:s=>states.push(s)});
assert.equal(reader.publish(topic,'1'),false,'no publish before connection');
reader.start();
const s=Socket.all.at(-1);
assert.equal(s.url,'ws://test/');
s.open();
assert.equal(reader.publish(topic,'1'),false,'no publish before MQTT CONNACK');
assert.equal(s.sent.length,1);
assert.equal(s.sent[0][0],0x10);
s.receive([0x20,0x02,0,0]);
assert.equal(states.at(-1),'connected');
assert.equal(s.sent.length,1,'no SUBSCRIBE when there are no state topics');
assert.equal(reader.publish(topic,'1'),true);
assert.equal(reader.publish(topic,'0'),true);
assert.equal(reader.publish('/devices/demo/controls/Dimmer/on','45'),true);
assert.equal(reader.publish('/invalid/#','1'),false);
assert.equal(reader.publish(topic,'x'.repeat(4097)),false);
const decoder = new TextDecoder();
const messages = s.sent.slice(1);
function decode(p) {
  assert.equal(p[0],0x30,'outbound PUBLISH QoS 0, retain flag off');
  let factor=1, length=0, pos=1, digit;
  do { digit=p[pos++]; length+=(digit&127)*factor; factor*=128; } while(digit&128);
  assert.equal(length,p.length-pos);
  const tlen=p[pos]*256+p[pos+1]; pos+=2;
  return [decoder.decode(p.subarray(pos,pos+tlen)), decoder.decode(p.subarray(pos+tlen))];
}
assert.deepEqual(messages.map(decode), [[topic,'1'],[topic,'0'],['/devices/demo/controls/Dimmer/on','45']]);
s.close();
assert.equal(reader.publish(topic,'1'),false,'no publish when disconnected');
reader.stop();

const model=window.WBPanelModel;
const demo=model.createDemo();
const button=demo.root.children[2].children[0].children.find(n=>n.type==='button');
const sw=demo.root.children[2].children[1].children.find(n=>n.type==='switch');
const slider=demo.root.children[2].children[1].children.find(n=>n.type==='slider');
button.mqtt={actionTopic:topic,actionValue:'1',statusTopic:'demo/state',activeValue:'1'};
sw.mqtt={actionTopic:topic,onValue:'ON',offValue:'OFF'};
slider.mqtt={actionTopic:'demo/level/on'};
const roundtrip=model.normalizeProject(JSON.parse(JSON.stringify(demo)));
const find=(node,id)=> node.id===id ? node : node.type==='container' ? node.children.map(c=>find(c,id)).find(Boolean) : undefined;
assert.equal(find(roundtrip.root,button.id).mqtt.actionValue,'1');
assert.equal(find(roundtrip.root,sw.id).mqtt.offValue,'OFF');
assert.equal(find(roundtrip.root,slider.id).mqtt.actionTopic,'demo/level/on');
const legacy=model.normalizeProject(model.createDemo());
assert.equal(legacy.version,3);
console.log('[OK] MQTT: команды QoS0, кнопка/переключатель/ползунок, нет PUBLISH до подключения');
console.log('[OK] MQTT: action-only, обработка отключения и совместимость JSON v3');
