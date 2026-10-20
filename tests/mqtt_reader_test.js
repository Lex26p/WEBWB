/* Node.js smoke test for MQTT read-only client, no broker/network needed. */
'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

class FakeSocket {
  static OPEN = 1;
  static created = [];
  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.readyState = 0;
    this.sent = [];
    FakeSocket.created.push(this);
  }
  open() { this.readyState = 1; this.onopen?.(); }
  send(payload) { this.sent.push(new Uint8Array(payload)); }
  receive(bytes) { this.onmessage?.({data:Uint8Array.from(bytes).buffer}); }
  close() { this.readyState = 3; this.onclose?.(); }
}
const globalWindow = {};
const context = vm.createContext({
  window: globalWindow, WebSocket: FakeSocket, URL, Uint8Array, ArrayBuffer,
  TextEncoder, TextDecoder, Math, setTimeout, clearTimeout, setInterval, clearInterval
});
const file = path.join(__dirname, '..', 'frontend', 'js', 'mqtt_reader.js');
vm.runInContext(fs.readFileSync(file, 'utf8'), context, {filename:file});
const mqtt = globalWindow.WBPanelMQTT;
assert.equal(mqtt.validTopic('/devices/demo/controls/State'), true);
assert.equal(mqtt.validTopic('/devices/#'), false);
assert.equal(mqtt.validTopic(''), false);
assert.equal(mqtt.resolveURL(null, new URL('http://localhost:8090/viewer.html?id=x')), 'ws://localhost:8090/mqtt');
assert.equal(mqtt.resolveURL('ws://localhost:18883/', new URL('http://localhost:8090/')), 'ws://localhost:18883/');
assert.throws(() => mqtt.resolveURL('http://example.com/', new URL('http://localhost/')));

const states = [], values = [];
const topics = ['/devices/demo/controls/State', '/devices/demo/controls/Temperature'];
const client = mqtt.createReader({url:'ws://test/', topics:[...topics, topics[0]],
  onState: v=>states.push(v), onMessage:(topic,value)=>values.push([topic,value])});
client.start();
assert.equal(FakeSocket.created.length,1);
const socket = FakeSocket.created[0];
assert.equal(socket.url,'ws://test/');
assert.equal([...socket.protocols].join(','), 'mqtt');
socket.open();
assert.equal(socket.sent[0][0],0x10,'first outgoing packet must be CONNECT');
socket.receive([0x20, 0x02, 0, 0]);
assert.equal(socket.sent[1][0],0x82,'second outgoing packet must be SUBSCRIBE');
assert.equal(states.at(-1),'connected');
const subscribedText = new TextDecoder().decode(socket.sent[1]);
for (const topic of topics) assert(subscribedText.includes(topic));
assert.equal(subscribedText.split(topics[0]).length,2,'duplicate subscriptions removed');

function publish(topic, value) {
  const t = new TextEncoder().encode(topic);
  const v = new TextEncoder().encode(value);
  const length = 2+t.length+v.length;
  assert(length<128);
  return [0x31, length, t.length>>8, t.length&255, ...t, ...v]; // retained PUBLISH
}
const p1=publish(topics[0],'1');
socket.receive(p1.slice(0,5));
assert.equal(values.length,0,'incomplete MQTT packet not applied');
socket.receive(p1.slice(5));
assert.deepEqual(values[0],[topics[0],'1']);
socket.receive(publish(topics[1],'22.5'));
assert.deepEqual(values[1],[topics[1],'22.5']);
socket.receive(publish('/unknown','999'));
assert.equal(values.length,2,'unknown topics ignored');
assert(socket.sent.every(p=>![0x30,0x31,0x32,0x33].includes(p[0])),
  'read-only client must never send MQTT PUBLISH');
client.stop();
assert.equal(socket.readyState,3);

// Existing v3 documents must round-trip with optional MQTT state bindings.
const modelPath = path.join(__dirname, '..', 'frontend', 'js', 'model.js');
vm.runInContext(fs.readFileSync(modelPath, 'utf8'), context, {filename:modelPath});
const demo = globalWindow.WBPanelModel.createDemo();
const textNode = demo.root.children[0];
textNode.mqtt = {statusTopic:'/devices/demo/controls/Temperature'};
const switchNode = demo.root.children[2].children[1].children.find(n=>n.type==='switch');
switchNode.mqtt = {statusTopic:'/devices/demo/controls/State', activeValue:'1'};
const restored = globalWindow.WBPanelModel.normalizeProject(JSON.parse(JSON.stringify(demo)));
assert.equal(restored.root.children[0].mqtt.statusTopic, textNode.mqtt.statusTopic);
assert.equal(restored.root.children[2].children[1].children.find(n=>n.type==='switch').mqtt.activeValue, '1');
assert.equal(globalWindow.WBPanelModel.normalizeProject(globalWindow.WBPanelModel.createDemo()).version, 3);
console.log('[OK] MQTT: необязательные поля сохраняются в JSON v3, старые проекты совместимы');
console.log('[OK] MQTT: подключение, подписки, retained PUBLISH, фрагменты и отсутствие команд');
