// Used only by the local notification test runner. Tests must provide doubles.
const forbidden = () => { throw new Error('Outbound networking is disabled in notification mock tests.'); };
globalThis.fetch = forbidden;
require('node:http').request = forbidden;
require('node:http').get = forbidden;
require('node:https').request = forbidden;
require('node:https').get = forbidden;
require('node:net').Socket.prototype.connect = forbidden;
require('node:tls').connect = forbidden;
