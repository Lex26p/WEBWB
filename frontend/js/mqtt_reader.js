/* WEBWB: MQTT 3.1.1 over WebSocket. Только CONNECT / SUBSCRIBE / PINGREQ.
 * Публикация команд намеренно отсутствует до шага 12.
 */
(() => {
  'use strict';
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const encoded = value => encoder.encode(value);
  const MAX_PACKET = 1024 * 1024;

  function mqttString(value) {
    const bytes = encoded(value);
    if (bytes.length > 65535) throw new Error('Слишком длинная MQTT-строка');
    return [bytes.length >> 8, bytes.length & 255, ...bytes];
  }
  function packet(type, bytes) {
    const length = [];
    let n = bytes.length;
    do { const digit = n % 128; n = Math.floor(n / 128); length.push(digit | (n ? 128 : 0)); } while (n);
    return new Uint8Array([type, ...length, ...bytes]);
  }
  function connectPacket(clientId) {
    return packet(0x10, [...mqttString('MQTT'), 4, 2, 0, 45, ...mqttString(clientId)]);
  }
  function subscribePacket(topics) {
    const body = [0, 1]; // Packet identifier = 1; соединение одно, SUBSCRIBE один.
    for (const topic of topics) body.push(...mqttString(topic), 0); // QoS 0.
    return packet(0x82, body);
  }
  function resolveURL(raw, currentLocation) {
    if (!raw) return new URL('/mqtt', currentLocation.href).href.replace(/^http/, 'ws');
    const url = new URL(raw, currentLocation.href);
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') throw new Error('Только ws:// или wss://');
    if (url.username || url.password) throw new Error('Учётные данные в адресе MQTT не поддерживаются');
    return url.href;
  }
  function validTopic(topic) {
    return typeof topic === 'string' && topic.length > 0 && encoded(topic).length <= 256 &&
      !/[\u0000+#]/.test(topic);
  }
  function readPackets(buffer, onPacket) {
    let offset = 0;
    while (offset < buffer.length) {
      const start = offset;
      if (buffer.length - offset < 2) break;
      const type = buffer[offset++];
      let length = 0, factor = 1, done = false;
      for (let i = 0; i < 4; i++) {
        if (offset === buffer.length) return buffer.slice(start);
        const digit = buffer[offset++];
        length += (digit & 127) * factor;
        if (!(digit & 128)) { done = true; break; }
        factor *= 128;
      }
      if (!done || length > MAX_PACKET) throw new Error('Некорректный размер MQTT-пакета');
      if (buffer.length - offset < length) return buffer.slice(start);
      onPacket(type, buffer.subarray(offset, offset + length));
      offset += length;
    }
    return new Uint8Array(0);
  }
  function createReader(options) {
    const topics = [...new Set(options.topics)].filter(validTopic);
    let socket = null;
    let retry = null;
    let keepalive = null;
    let closed = false;
    let incoming = new Uint8Array(0);
    const notify = value => options.onState?.(value);
    function clearTimers() {
      clearTimeout(retry);
      clearInterval(keepalive);
      retry = null; keepalive = null;
    }
    function handlePacket(type, data) {
      const kind = type >> 4;
      if (kind === 2) { // CONNACK
        if (data.length !== 2 || data[1] !== 0) { socket?.close(); return; }
        socket.send(subscribePacket(topics));
        notify('connected');
        keepalive = setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) socket.send(packet(0xc0, []));
        }, 25000);
      } else if (kind === 3 && data.length >= 2) { // PUBLISH (входящий QoS 0)
        const len = data[0] * 256 + data[1];
        let pos = 2 + len;
        if (!len || pos > data.length) return;
        const topic = decoder.decode(data.subarray(2, pos));
        if ((type & 6) !== 0) { // Учитываем packet id для QoS 1, хотя подписка QoS 0.
          if (pos + 2 > data.length) return;
          pos += 2;
        }
        if (topics.includes(topic)) options.onMessage?.(topic, decoder.decode(data.subarray(pos, pos + 4096)));
      }
    }
    function connect() {
      if (closed) return;
      incoming = new Uint8Array(0);
      notify('connecting');
      try { socket = new WebSocket(options.url, ['mqtt']); }
      catch (_) { notify('disconnected'); scheduleRetry(); return; }
      socket.binaryType = 'arraybuffer';
      socket.onopen = () => {
        const id = 'webwb-' + Math.random().toString(16).slice(2, 12);
        socket.send(connectPacket(id));
      };
      socket.onmessage = event => {
        if (!(event.data instanceof ArrayBuffer)) return;
        const part = new Uint8Array(event.data);
        if (incoming.length + part.length > MAX_PACKET) { socket.close(); return; }
        const next = new Uint8Array(incoming.length + part.length);
        next.set(incoming); next.set(part, incoming.length);
        try { incoming = readPackets(next, handlePacket); }
        catch (_) { socket.close(); }
      };
      socket.onclose = () => { clearTimers(); notify('disconnected'); scheduleRetry(); };
      socket.onerror = () => { /* onclose сообщает о состоянии и запускает переподключение. */ };
    }
    function scheduleRetry() {
      if (!closed && retry === null) retry = setTimeout(() => { retry = null; connect(); }, 3000);
    }
    return {
      start() { if (topics.length && !closed) connect(); },
      stop() { closed = true; clearTimers(); if (socket) socket.close(); }
    };
  }
  window.WBPanelMQTT = Object.freeze({createReader, resolveURL, validTopic});
})();
