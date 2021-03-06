# RedPop

RedPop is a pre-baked Redis Streams consumer and publisher library for Nodejs.  Use it to simplify the creation of an event bus architecture and to create  horizontally scalable data processing applications.  RedPop leverages the work of the ioredis (https://www.npmjs.com/package/ioredis) package and "fills in the gaps" with built-in handlers to deal with the minutae of event replay, cleanup, and consumer and consumer group management. 

# configuration for publisher {default}

```javascript
{
     server: {
        // Redis connection type -- standalone or cluster
        connectionType: 'standalone',
        // Connection for standalone connectionType
        conection: {
            // URI of the Redis server (default localhost)
            // Do NOT include protocol like REDIS://localhost or REDIS://somedomain.amazonaws.com
            host: 'localhost',
            // TCP port the Redis server is listening on (default 6370)
            port: 6370,
        },
        // Array of connections for cluster connectionType
        connections: {[          
            // URI of the Redis server (default localhost)
            // Do NOT include protocol like REDIS://localhost or REDIS://somedomain.amazonaws.com
            host: 'localhost',
            // TCP port the Redis server is listening on (default 6370)
            port: 7000,
        ]},
        // Other options that can be passed in.  See ioredis documentation here:
        // https://github.com/luin/ioredis/blob/master/API.md
        options: {
        }
        // Optional password if your server's requirepass is set to a password
        password: 'yourpassword',
    },
    stream: {
        // name of the stream or 'topic' (default redpop)
        name: 'redpop',
    },
}
```

# configuration for consumer

```javascript
{
     server: {
         // Redis connection type -- standalone or cluster
         connectionType: 'standalone',
         // Connection for standalone connectionType
         conection: {
            // URI of the Redis server (default localhost)
            // Do NOT include protocol like REDIS://localhost or REDIS://somedomain.amazonaws.com
            host: 'localhost',
            // TCP port the Redis server is listening on (default 6370)
            port: 6370,
        }
        // Array of connections for cluster connectionType
        connections: [{         
            // URI of the Redis server (default localhost)
            // Do NOT include protocol like REDIS://localhost or REDIS://somedomain.amazonaws.com
            host: 'localhost',
            // TCP port the Redis server is listening on (default 6370)
            port: 7000,
        }],
        options: {
            // ioRedis options that can be passed in.  See ioredis documentation here:
            // https://github.com/luin/ioredis/blob/master/API.md
        },
        // Optional password if your server's requirepass is set to a password
        password: 'yourpassword',
    },
    stream: {
        // name of the stream or 'topic' (default redpop)
        name: 'redpop',
    },
    consumer: {
        // Consumer group pool that takes the same action
        group: 'redpop_consumer',
        // How long does the consumer wait for a batch of events each polling cycle (default 2 seconds)
        waitTimeMs: 2000,
        // How long the consumer is idle before being recycled from the server pool (default 90 mins)
        idleTimeoutMs: 5400000,
        // If a consumer doesn't process an event fast enough, how long before
        // the event is put back into the pool for reprocessing (default 2 mins)
        eventPendingTimeoutMs: 120000,
        // How many events will the consumer pull from the server each time (default 50)
        batchSize: 50,
        // How many times does an event get replayed before the event is discarded (default 3)
        // This will discard an event if it is erroring out repeatedly
        eventMaximumReplays: 3,
        // How many times to poll for events.  If true, it will poll once and exit, otherwise it will 
        // poll indefinitely until the process is shut down.  If false, the calling program can create
        // a custom loop that calls consumer.start() to poll for events.
        runOnce: true
    },
}
```

# RedPop.Publisher -- Publishing an Event

Using RedPop to publish a event, you send it an object which is a key-value pair. The value can be any data type including complex objects.

## Example 1:

Simple example of publishing a event to the stream defined in `config.js`

```javascript
    const { Publisher } = require('redpop');
    const config = require('./config'); // contains RedPop config file
    const publisher = new Publisher(config).connect();

    const event = { id: 1234, name: 'John Doe' };
    publisher.publish(event);
```

The consumer's onEvent might look like this:

```javascript
    aysnc onEvent = (event)=> {
        console.log(event.id);
        console.log(event.data.id);
    }
```

## Example 2:

Publish a more complex event to a specific stream, overriding the stream name in `config.js`.  Why override the config file?   Well, if your consumer wants to republish a event to a different stream  you will want to do this. For instance, republishing can be used for logging, sending notifications, or publishing a new version of data to a different consumer as a part of a data transformation pipeline.

```javascript
    const { Publisher } = require('redpop');
    const config = require('./config');  // contains RedPop config file. See Aboves
    const publisher = new Publisher(config).connect();
    const streamName = 'someOtherStream';
    const event =
        { action: 'save',
          payload: {id: 1234, name: 'John Doe'}};
        };
    publisher.publish(event, streamName)

```

The consumer's onEvent might look like this:

```javascript
    aysnc onEvent = (event)=> {
    const action = event.data.action;
    switch (action) {
        case 'save' :
             this.saveMethod(event.data.payload);
             return true;
        case 'delete' :
             this.deleteMethod(event.data.payload.id);
             return true;
        default : 
            return false;
    }
```


# RedPop.consumer -- Consuming an Event

RedPop's consumer takes care of all of the headachey things that an event processor needs to be 
concerned about.

These include:

 * Replaying events that failed during processing (e.g. database unavailable)
 * Canceling replay of events that failed processing too many times
 * Cleaning up old consumers

The only thing that you really need to do as a developer is override the onEvent() method.

A simple consumer need only include this: 

```javascript
    const { Consumer } = require('redpop');

    async onEvent(event) {
        const myEventId = event.id
        const myEventPayload = event.data
        this.doSomethingWith(myEventPayload);
        return true;  // return true to mark the event as processed, false to tell Redis to replay the message.
    }

module.exports = AuthInitPwdResetConsumer;

```


That's it!  To call it you might have an index.js file that runs this code: 

```javascript
    const Consumer = require('./consumer');
    const config = require('./config');

    const consumer = new Consumer(config); // you can call .connect() or the consumer will connect when start() runs.

    console.info('Starting my cool consumer');
    console.info('Press ctrl-c to quit');

    consumer.start();
```

And finally a package.json script that runs the index.js file: 

```javascript
 "scripts": {
    "start": "node ./src/index.js",
  },
```

## Advanced Processing

RedPop's consumer also exposes event hooks for the batch-level processing.  This can be useful for logging or performing any kind of cleanup operations when a batch completes or when all of the batches in a Redis stream have been played.  RedPop's consumer is stateful from the time it starts until it is stopped.  So you can add things like counters or arrays of logging events to the consumers to batch them up.  You can see in the demos consumer that it counts the number of batches it processes and logs it out after all of the batches complete.  That's probably not too interesting but in a real-world app, you may want to keep track of data errors as it is processing and send an email with all of the discrepancies after the batch completes or after all batches have completed. 

These event hooks include:

#### Consumer :: init()

init() runs when the consumer first starts up.  

#### Consumer :: onBatchComplete()
    
onBatchComplete() runs when the current batch of events finishes processing.  A batch is defined in the config passed into to the concusmer class when it instantiates. See batchSize parameter in the consumer config

#### Consumer :: onBatchesComplete()

onBatchesComplete() runs when the consumer finishes processing all batches of events.  In other words, the stream has been played to the last event.  onBatchesComplete runs before the consumer goes back into a polling mode.  


#### Example consumer with advanced processing: 

In the following example, we have a consumer that listens for password reset request events.  When it receives one, it will generate a reset code and then send a notification to the user via EMAIL and SMS (via another event stream).  It keeps track of how many resets it has processed and sends a notification to the admin group (via yet another event stream).  

```javascript
const { Consumer } = require('redpop');

class AuthInitPwdResetConsumer extends Consumer {
  init() {
    // Code in Init runs when the consumer first starts up.
    // Set the passwords counter to 0
    this.passwordsReset = 0
    this.notificationStream = 'userNotifierStream'
    this.adminNotifyStream = 'adminNotifierStream'
  }

  async onBatchesComplete() {
    // Runs after each batch is complete.  For example
    // stream receives 500 events and config.batchSize=50
    // this will run after 10 batches of events.
    this.passwordsReset = 0;
  }

  async onBatchComplete() {
    // Runs after each batch is complete.  For example
    // stream receives 500 events and config.batchSize=50
    // this will run after each batch of 50 events.
    const event = {method: 'email', email: 'admin@yourcompany.com', passwordsReset: this.passwordsReset};
    await this.publish(event, this.adminNotifyStream);  
  }

  async onEvent(event) {
    const resetCode = this.storePasswordResetCode(event.data.user);
    const emailPublisher = new Publisher(this.config)
    
    const eventToPublish1 = {method: 'email', email: event.data.user.email, resetCode: resetCode};
    const eventToPublish2 = {method: 'sms', email: event.data.user.mobileNumber, resetCode: resetCode};
    

    // Here we are actually publishing to a different stream that is responsible for sending notifications
    // The assumption here is that we have a different Consumer instance listening to the other
    // stream and it knows how to send email and sms notifications.   This way we can chain the event
    // processors to handle discrete tasks in response to a user requesting a password reset code.
    await this.publish(eventToPublish1, this.notificationStream);  
    await this.publish(eventToPublish2, this.notificationStream); 

    // This value will persist until it is reset in onBatchesComplete()
    this.passwordsReset += 1;
    return true;
  }
}

module.exports = AuthInitPwdResetConsumer;
```
<br>

### Testing

Redpop includes a `connect()` method to initiate the actual Redis connection.  This allows the test code to unit test RedPop instances without actually connecting to Redis.  

For instance, let's say you have a consumer that consumes the event, mutates the payload, and then publishes back onto another stream.  

Here's an example of how you can test it using `sinon` and `mocha`:

```javascript
// Consumer Code - MyConsumer.js
const { Consumer, Publisher } = require('redpop')

class MyConsumer extends Consumer {
    constructor(config) {
      super(config);
      this.publisher = new Publisher(config);
    }

    async onEvent(event){
        const mutatedMessgae = {...event.data, processedDate: new Date()};
        await publisher.publish(mutatedMessgae, 'someOtherStream');
        return true;
    }
}

```

Now you can test this without the publisher or the consumer actually trying to make an actual connection to a Redis server:

```javascript
// Test Code
const { Publisher } = require('redpop');
const MyConsumer = require('./MyConsumer');

const sandbox = require('sinon').createSandbox();

describe(`some Consumer's Tests`, () => {
    let event = {id: '123456789-1', data: {email: 'someone@gmail.com'}};
    let pubStub;
    let connectStub;
    beforeEach(() => {
        pubStub = sandbox.stub(Publisher.prototype, 'publish');  // Stub here
        conectStub = sandbox.stub(Publisher.prototype, 'connect');  // Stub here
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('unit tests my consumer without connecting', () => {
        const myConsumer = new MyConsumer();
        testResult = myConsumer.onEvent(event);
        sandbox.assert.calledOnce(pubStub);
        sandbox.assert.calledOnce(connectStub);
    })
});
```


###  Managing Stream Size 

Redis streams is extremely fast because all events are resident in memory.  As a design consideration, it is necessary to manage the size of the streams and not let them grow unbounded.  RedPop does not automatically manage the trimming of streams so it is necessary for the application to do this.  RedPop wraps the Redis XTRIM command  and makes it availalable for consumers and publishers to manage the size stream.  Two possible approaches to managing stream size this are: 

1) In a consumer's onBatchesComplete(), call `this.xtrim(streamName, maxEventsAsInt)`
2) Create a separate consumer that listens to the stream whose job is to manage the stream length and call `this.xtrim(streamName, maxEventsAsInt)`

If multiple consumers are listening to a stream, care will need to be taken to ensure all the consumers have had an opportunity to process the events.