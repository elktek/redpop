/* eslint-disable no-await-in-loop */
const cloneDeep = require('lodash/cloneDeep');
const nanoid = require('nanoid');
const RedPop = require('../RedPop');
const EventBatch = require('./EventBatch/EventBatch');
const PendingEvents = require('./PendingEvents');
const IdleConsumers = require('./IdleConsumers');
const defaultConfig = require('./config');

/**
 * Consumer is an abstract class that encapsulates
 * the functionalty to run a consumer.  A subclass
 * should extend this class and override the abstract
 * method(s).  At a minimum, onEvent should be extended.
 *
 */
class Consumer extends RedPop {
  constructor(config) {
    const rpConfig = config || cloneDeep(defaultConfig);
    // process configuration in parent class RedPop
    super(rpConfig);
    this.processing = false;
  }

  /**
   * Initializer that runs at the begin of the first consumed batch
   */
  async _init() {
    // Ensure consumer group exists
    try {
      await this.xgroup(
        'CREATE',
        this.config.stream.name,
        this.config.consumer.group,
        '$',
        'MKSTREAM'
      );
    } catch (e) {
      console.log(
        `Found existing consumer group '${this.config.consumer.group}'`
      );
    }

    await this.init();
  }

  /**
   * setConfig
   * Sets consumer specific configuration settings
   */
  setConfig() {
    const { consumer } = this.config;
    const defConsumer = defaultConfig.consumer;

    consumer.name = `${this.config.consumer.group}_${nanoid.nanoid()}`;
    consumer.waitTimeMs = consumer.waitTimeMs || defConsumer.waitTimeMs;
    consumer.batchSize = consumer.batchSize || defConsumer.batchSize;
    consumer.idleTimeoutMs = consumer.idleTimeoutMs || defConsumer.batchSize;
    consumer.eventMaximumReplays =
      consumer.eventMaximumReplays || defConsumer.eventMaximumReplays;
  }

  /**
   * onEvents
   *
   * Processes a batch of events calling the users. utiltiy onEvent()
   * be overridden in a subclass
   *
   * @param {Object} events - Array of events received via ioredis.
   *
   */

  async _onEvents(batch) {
    const events = batch.getEvents();
    await events.reduce(async (memo, event) => {
      await memo;
      const currentEvent = event;
      const result = await this.onEvent(currentEvent);
      if (result) {
        await this.xack(currentEvent.id);
      }
      return memo;
    }, Promise.resolve());
  }

  /**
   * poll -- Main loop to poll Redis for events
   */

  async start() {
    const { stream, consumer } = this.config;

    if (!this.connected) {
      this.connect();
    }
    await this._init();
    let done = false;

    if (!stream?.name) {
      console.error('Error - Consumer requires a stream to be configured');
      return false;
    }

    while (!done) {
      try {
        const batch = await this.xreadgroup([
          'GROUP',
          consumer.group,
          consumer.name,
          'BLOCK',
          consumer.waitTimeMs,
          'COUNT',
          consumer.batchSize,
          'STREAMS',
          stream.name,
          '>'
        ]);

        if (!batch) {
          await this._onBatchesComplete();
        } else {
          const eventBatch = new EventBatch(batch);
          await this._onBatchReceived(eventBatch);
          await this._onBatchComplete();
        }

        if (this.config.consumer.runOnce) {
          // used for tests to break out of the loop
          // normally this loop never ends until the
          // process is terminated.
          done = true;
        }
      } catch (e) {
        try {
          console.log('Redis server connection lost, resetting connection....');
          console.log('Disconnecting');
          this.disconnectRedis();
          console.log('Reconnecting');
          this.connected = false;
          this.connect();
          console.log('Initializing');
          this._init();
          console.log('Finished resetting connection');
        } catch (e1) {
          console.log(e1);
        }
      }
    }

    return 'stopped';
  }

  /**
   * Events
   */

  /**
   * onBatchesComplete()
   */
  async _onBatchesComplete() {
    // Perform post-processing after all
    // events in the stream have been played
    this.processing = false;
    await this.onBatchesComplete();
    await this._processPendingEvents();
    await this._removeIdleConsumers();
  }

  /**
   * onBatchReceived()
   *   Process the new batch of events.
   *   this.onEvents should be overridden in a
   *   subclass of Consumer
   */
  async _onBatchReceived(eventBatch) {
    this.processing = true;
    await this._onEvents(eventBatch);
  }

  /**
   * onBatchComplete()
   *   Perform any batch-specific post-processing
   */
  async _onBatchComplete() {
    await this.onBatchComplete();
  }

  /**
   * processPendingEvent()
   *   Process any events that were played by other
   *   consumers and didn't result in an xack.  This
   *   can happen if the subbscriber is terminated in
   *   the middle of processing an event or if an unhandled
   *   error occurs in the onEvent() call.
   */
  async _processPendingEvents() {
    const pendingEvents = new PendingEvents(this);
    await pendingEvents.processPendingEvents();
  }

  /**
   * removeIdleConsumers()
   *   Remove consumers that have been idle
   *   longer than config.consumer.idleConsumerTimeoutMs
   */
  async _removeIdleConsumers() {
    const idleConsumers = new IdleConsumers(this);
    await idleConsumers.removeIdleConsumers();
  }

  /**
  /**
   *  * Abstract Methods --  Override in sub-classes
   */

  /**
   * onEvent
   *
   */

  async onEvent() {
    return true;
  }

  /**
   * onBatchComplete
   *
   */
  async onBatchComplete() {
    return true;
  }

  /**
   * onBatchesComplete
   *
   */
  async onBatchesComplete() {
    return true;
  }

  /**
   * init()
   *
   */
  async init() {
    return true;
  }
}

module.exports = Consumer;
