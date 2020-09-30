
/**
 * An exception used to shut down the loop.
 *
 * User code should not need to be aware of this class.
 */
class InterruptLooper extends Error {
  constructor(message) {
    super(message);
    this.name = "InterruptLooper";
  }
}

/**
 * An exception thrown when calling stop() multiple times.
 */
class LooperAlreadyStopping extends Error {
  constructor(message) {
    super(message);
    this.name = "LooperAlreadyStopping";
  }
}

/**
 * An exception thrown when calling start() multiple times.
 */
class LooperAlreadyRunning extends Error {
  constructor(message) {
    super(message);
    this.name = "LooperAlreadyRunning";
  }
}

function sleep(ms=0)
{
   return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

/**
 * Run a loop in the background.
 *
 * - async function updateFunc runs every updateTime ms
 * - Error in updateFunc calls errorCallback but does not stop the loop
 * - Call start() to start the loop
 * - Call stop() to stop the loop
 * - Does not guarantee updateFunc() will not be called after stop
 */
class Looper {
   constructor( updateFunc, updateTime, errorCallback ) {
      this.updateFunc = updateFunc;
      this.updateTime = updateTime;
      this.errorCallback = errorCallback;
      this._joinWaiters = [];
      this._runningUpdateLoop = null;

      this._interruptResolve = null;
   }

   /**
    * Return a promise that resolves when this task is finished.
    */
   join() {
      let resolve = null;
      let prom = new Promise(function(res) { resolve = res; });
      if( this._runningUpdateLoop === null ) {
         // Not running, so join() will return a promise that resolves immediately
         resolve();
      }
      else {
         // Running, so join() will add to _joinWaiters
         this._joinWaiters.push(resolve);
      }
      return prom;
   }

   /**
    * Ask the loop to stop.  Return a promise that resolves when the loop has stopped.
    *
    * If stop() was already called, immediately throw a LooperAlreadyStopping exception.
    */
   stop() {
      if( this._interruptResolve == null ) {
         throw new LooperAlreadyStopping();
      }

      // Call _interruptResolve() to fire the promise.
      setTimeout( this._interruptResolve, 0 );
      this._interruptResolve = null;
      return this.join();
   }

   /**
    * Start the loop.  Fire-and-forget.
    *
    * If start() was already called, immediately throw a LooperAlreadyStarting exception.
    */
   start() {
      if( this._runningUpdateLoop !== null ) {
         throw new LooperAlreadyRunning();
      }

      // Create promise for interrupt.
      let reject = null;
      let prom = new Promise( function(res, rej) { reject = rej; } );
      // _interruptResolve() will inject an InterruptLooper exception into the loop.
      this._interruptResolve = function() { reject( new InterruptLooper("Interrupt") ); };

      this._runningUpdateLoop = this._updateLoop(prom);          // Fire-and-forget
   }

   /**
    * The main loop.
    *
    * Runs forever, until _interruptPromise is triggered.
    * You should call start() instead of calling this method directly.
    */
   async _updateLoop( _interruptPromise ) {
      while( true )
      {
         try
         {
            await Promise.race( [ _interruptPromise, sleep( (0.75 + 0.5*Math.random()) * this.updateTime ) ] );
            await Promise.race( [ _interruptPromise, this.updateFunc()] );
         }
         catch( e )
         {
            if( e.name === "InterruptLooper" )
               break;
            if (this.errorCallback && typeof this.errorCallback === "function") {
               this.errorCallback(e);
            }
         }
      }

      //
      // Use setTimeout(f, 0) here so we don't immediately call external code which might attempt to mutate
      //    this._joinWaiters during the loop.
      //
      // If join() is called before we get to this point, the result will be resolved due to the following loop.
      // If join() is called after this point, it will correctly return a resolved promise due to _runningUpdateLoop == null.
      //
      for( let i=0; i<this._joinWaiters.length; i++ ) {
         setTimeout( this._joinWaiters[i], 0 );
      }

      this._runningUpdateLoop = null;
      this._joinWaiters = [];
   }
}

module.exports = {
   Looper : Looper,
   InterruptLooper : InterruptLooper,
   LooperAlreadyStopping : LooperAlreadyStopping,
   LooperAlreadyRunning : LooperAlreadyRunning,
   sleep : sleep
   };
