'use strict';

var assert = require('assert'),
    Q = require('q'),
    api = require('./../functionalTest/api/api').create(),
    client = require('./../functionalTest/api/http/baseHttpClient').create('http'),
    promiseIt = require('./../functionalTest/testHelpers').promiseIt,
    port = api.port + 1,
    mb = require('../functionalTest/mb').create(port + 1),
    numRequests = 15000,
    baselineMemory = 4000,
    minIncreasedMemory = 200;

function getMemoryUsedForManyRequests (mbPort) {
    var stub = { responses: [{ is: { statusCode: 400 } }] },
        request = { protocol: 'http', port: port, stubs: [stub] },
        requestFn = function () { return client.get('/', port); },
        allRequests = [],
        originalProcess;

    for (var i = 0; i < numRequests; i += 1) {
        allRequests[i] = requestFn;
    }

    return client.post('/imposters', request, mbPort).then(function (response) {
        assert.strictEqual(response.statusCode, 201);
        return client.get('/config', mbPort);
    }).then(function (response) {
        originalProcess = response.body.process;

        // Using Q.all above a certain requests threshold gives me an ETIMEDOUT or other errors
        return allRequests.reduce(Q.when, Q(true));
    }).then(function () {
        return client.get('/config', mbPort);
    }).then(function (response) {
        return (response.body.process.rss - originalProcess.rss) / numRequests;
    }).finally(function () {
        return client.del('/imposters/' + port, mbPort);
    });
}

describe('mb', function () {
    this.timeout(300000);

    describe('when remembering requests', function () {
        promiseIt('should increase memory usage with number of requests', function () {
            return mb.start(['--mock']).then(function () {
                return getMemoryUsedForManyRequests(mb.port);
            }).then(function (memoryUsed) {
                console.log('memory usage for ' + numRequests + ' requests with --mock: ' + memoryUsed);
                assert.ok(memoryUsed > baselineMemory + minIncreasedMemory, 'Memory used: ' + memoryUsed);
            }).finally(function () {
                return mb.stop();
            });
        });
    });

    describe('when not remembering requests', function () {
        promiseIt('should not leak memory', function () {
            return mb.start().then(function () {
                return getMemoryUsedForManyRequests(mb.port);
            }).then(function (memoryUsed) {
                console.log('default memory usage with for ' + numRequests + ' requests: ' + memoryUsed);
                assert.ok(memoryUsed < baselineMemory, 'Memory used: ' + memoryUsed);
            }).finally(function () {
                return mb.stop();
            });
        });
    });
});
