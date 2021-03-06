const { expect } = require('chai');
const Redis = require('ioredis');
const sinon = require('sinon');

const sandbox = sinon.createSandbox();

describe('RedPop Unit Tests', () => {
  let RedPop;
  let xaddStub;
  let xackStub;
  let xreadgroupStub;
  let xdelStub;
  let xlenStub;
  let xtrimStub;
  let xclaimStub;

  before(() => {
    // This needs to be required here or the mocking doesn't work.
    // eslint-disable-next-line global-require
    RedPop = require('.');
  });
  beforeEach(() => {
    xaddStub = sandbox.stub(Redis.prototype, 'xadd').resolves('eventId');
    xackStub = sandbox.stub(Redis.prototype, 'xack').resolves('eventId');
    xdelStub = sandbox.stub(Redis.prototype, 'xdel').resolves('eventId');
    xlenStub = sandbox.stub(Redis.prototype, 'xlen').resolves('eventId');
    xtrimStub = sandbox.stub(Redis.prototype, 'xtrim').resolves(1);
    xclaimStub = sandbox.stub(Redis.prototype, 'xclaim').resolves([]);
    xreadgroupStub = sandbox
      .stub(Redis.prototype, 'xreadgroup')
      .resolves('eventId');
  });

  afterEach(() => {
    sandbox.restore();
  });
  after(() => {
    RedPop = null;
  });

  it('instantiates without a config parameter', () => {
    const redPop = new RedPop();
    expect(redPop.config).is.an('Object');
    expect(redPop.config.server.connection.host).equals('localhost');
  });

  it('instantiates with a config parameter in standalone mode', () => {
    const config = {
      server: {
        connectionType: 'standalone',
        connection: {
          host: '127.0.0.1',
          port: 6379
        }
      },
      stream: {
        name: 'someStream'
      }
    };
    const redPop = new RedPop(config);
    expect(redPop.config).is.an('Object');
    expect(redPop.config.server.connection.host).equals('127.0.0.1');
    expect(redPop.config.server.connection.port).equals(6379);
    expect(redPop.config.server.connectionType).equals('standalone');
    expect(redPop.config.stream.name).equals('someStream');
  });

  // fails in GH actions because it doesn't use a cluster configuration
  // eslint-disable-next-line mocha/no-skipped-tests
  it.skip('instantiates with a config parameter in cluster mode', () => {
    const config = {
      server: {
        connectionType: 'cluster',
        connections: [
          {
            host: '127.0.0.1',
            port: 7000
          }
        ]
      },
      stream: {
        name: 'someStream'
      }
    };
    const redPop = new RedPop(config);
    expect(redPop.config).is.an('Object');
    expect(redPop.config.server.connections[0].host).equals('127.0.0.1');
    expect(redPop.config.server.connections[0].port).equals(7000);
    expect(redPop.config.server.connectionType).equals('cluster');
    expect(redPop.config.stream.name).equals('someStream');
  });

  it('calls xlen', async () => {
    const redPop = new RedPop().connect();
    await redPop.xlen();
    expect(xlenStub.calledOnce).equals(true);
  });

  it('calls xdel', async () => {
    const redPop = new RedPop().connect();
    await redPop.xdel();
    expect(xdelStub.calledOnce).equals(true);
  });

  it('calls xadd', async () => {
    const redPop = new RedPop().connect();
    await redPop.xadd([{ v: 'test', n: 12, j: { t: 'test' } }]);
    expect(xaddStub.calledOnce).equals(true);
  });

  it('calls xtrim', async () => {
    const redPop = new RedPop().connect();
    const numberTrimmed = await redPop.xtrim(10);
    expect(xtrimStub.calledOnce).equals(true);
    expect(numberTrimmed).equals(1);
  });

  it('calls xack', async () => {
    const redPop = new RedPop().connect();
    await redPop.xack('eventId', 'stream', 'group');
    expect(xackStub.calledOnce).equals(true);
  });

  it('calls xreadgroup', async () => {
    const redPop = new RedPop().connect();
    await redPop.xreadgroup([
      'GROUP',
      'groupname',
      'consumername',
      'BLOCK',
      2000,
      'COUNT',
      50,
      'STREAMS',
      'streamname',
      '>'
    ]);
    expect(xreadgroupStub.calledOnce).equals(true);
  });

  it('calls xclaim', async () => {
    const redPop = new RedPop().connect();
    const xclaimedEvents = await redPop.xclaim([12345]);
    expect(xclaimStub.calledOnce).equals(true);
    expect(Array.isArray(xclaimedEvents)).equals(true);
  });
});
