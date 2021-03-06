const { expect } = require('chai');
const faker = require('faker');
const cloneDeep = require('lodash/cloneDeep');
const config = require('./test/testConfig');

describe('RedPop Integration Tests', () => {
  let RedPop;
  before(() => {
    // eslint-disable-next-line global-require
    RedPop = require('.');
  });
  after(() => {
    RedPop = null;
  });

  describe('RedPop Integration Tests - Positive', () => {
    it('connects to a standalone instance', async () => {
      const configCopy = cloneDeep(config);
      configCopy.server.connectionType = 'standalone';
      const redPop = new RedPop(configCopy).connect();
      expect(redPop).to.be.an('object');
    });

    it('connects to a cluster instance', async () => {
      const configCopy = cloneDeep(config);
      configCopy.server.connectionType = 'cluster';
      const redPop = new RedPop(configCopy).connect();
      expect(redPop).to.be.an('object');
    });

    it('xlen returns an integer', async () => {
      const redPop = new RedPop(config).connect();
      const length = await redPop.xlen();
      expect(length).to.be.a('Number');
    });
    it('xadd, xdel, xlen', async () => {
      // Build an event with multiple keys. Each key as a different data type
      // including string, number, date, image, and JSON object.
      const jsonText = `{
          "${faker.lorem.word()}": "${faker.lorem.word()}",
          "${faker.lorem.word()}": "${faker.random.number()}",
          "${faker.lorem.word()}": "${faker.date.past()}",
          "${faker.lorem.word()}": "${faker.image.image()}",
          "${faker.lorem.word()}": {"${faker.lorem.word()}": "${faker.lorem.word()}"}}
      `;
      const jsonEvent = JSON.parse(jsonText);

      // Get a new RedPop instance and add an event
      const redPop = new RedPop(config).connect();
      // Store the current length of the stream
      const lengthBefore = await redPop.xlen();
      // Add an event - validate and store the event Id
      const eventId = await redPop.xadd(jsonEvent);
      expect(eventId).to.be.a('String');
      expect(eventId.length).equals(15);
      // Verify the new length of the stream is > than before
      expect(await redPop.xlen()).greaterThan(lengthBefore);
      // Delete the new event and verify stream-length goes back to pre-add length
      await redPop.xdel(eventId);
      expect(await redPop.xlen()).equals(lengthBefore);
    });
  });

  describe('RedPop Integration Tests - Negative', () => {
    it('throws if the connectionType is invalid', async () => {
      const configCopy = cloneDeep(config);
      configCopy.server.connectionType = '';
      let errorWasThrown = false;
      try {
        const redPop = new RedPop(configCopy).connect();
        // technically we shouldn't get past the instantiation so make
        // this fail we did.
        expect(redPop).to.not.be.an(
          'object',
          'redpop should not have instantiated'
        );
      } catch (e) {
        errorWasThrown = true;
      }
      expect(errorWasThrown).equals(
        true,
        'error should have been thrown with an invalid connectionType'
      );
    });
  });
});
