const { sleep } = require("./looper");

async function retry(msg, fn) {
    let tries = 0;
    let sleepTime = 200;
    let MAX_SLEEP_TIME = 60000;

    while (true) {
        try {
            if( tries > 0 ) {
               console.log("[JS] Attempting to " + msg + " ("+tries+" failed attempts)" );
            }
            return await fn();
        }
        catch (e) {
            ++tries;
            await sleep( (0.75 + 0.25*Math.random()) * sleepTime );
            sleepTime = Math.min( sleepTime*2, MAX_SLEEP_TIME );
        }
    }
}

module.exports = retry;
