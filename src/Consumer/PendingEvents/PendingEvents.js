const isEmpty = require('lodash/isEmpty');
const EventBatch = require('../EventBatch/EventBatch');

// Array element numbers to make the redis responses easier to understand
const EVENT_ID = 0;
const EVENT_REPLAY_COUNT = 3;

// PendingEvents will search for events on the Redis stream
// that were assigned to a consumer, but never XACKs as complete.
// This can happen if a consumer is shut down while processing a batch
// of events, the consumer crashes and never XACKS
// the event.  The consumer settings define how long before it is assumed
// that the event should be replayed as well as how many times to replay
// the event before deleteing the mssage from the bus (i.e. the event will
// never successuflly run so stop retrying)

class PendingEvents {
  constructor(consumer) {
    this.consumer = consumer;
    this.config = consumer.config;
    this.pendingMessges = [];
  }

  async _removeMaxRetries() {
    // Removes events that have been retried too many times by
    // XACK'ing them.  They remain in the stream.
    this._pendingEvents = this._pendingEvents.filter(event => {
      if (
        event[EVENT_REPLAY_COUNT] > this.config.consumer.eventMaximumReplays
      ) {
        // xack the event if it is past replays because there is
        // an error condition causing it to fail.
        this.consumer.xack(event[EVENT_ID]);
        return false;
      }
      return true;
    });
  }

  async _replayIdleEvents() {
    // The consumer will claim the events and attempt
    // to replay them as if they were a new batch that came in.
    if (this._pendingEvents.length > 0) {
      const pendingEventIds = this._pendingEvents.reduce((eventIds, event) => {
        eventIds.push(event[0]);
        return eventIds;
      }, []);

      const eventsToReplay = await this.consumer.xclaim(pendingEventIds);

      if (!isEmpty(eventsToReplay)) {
        // This will rebuild the list of events into an equivalent
        // format as XREAD produces to create an EventBatch instance
        //
        const xreadFormat = [[this.config.stream.name, eventsToReplay]];
        const eventBatch = new EventBatch(xreadFormat);
        this.consumer._onEvents(eventBatch);
      }
    }
  }

  async processPendingEvents() {
    // Retrieve pending events
    // Discard pendingEvents that have been retried config.eventMaximumReplays

    this._pendingEvents = await this.consumer.xpending();
    await this._removeMaxRetries();

    // Replay events that were claimed by a consumer
    // but that were not xack'd before config.eventPendingTimeoutMs

    await this._replayIdleEvents();
  }
}

module.exports = PendingEvents;
