const { sleep } = require("./looper");

async function retry(msg, fn) {
    let tries = 0;
    while (true) {
        try {
            return await fn();
        }
        catch (e) {
            let sleepTime = 60000;
            if (tries < 10) {
                sleepTime = Math.pow(2, tries) * 100;
                tries++;
            }
            console.log('[JS] Attempting to ' + msg );
            await sleep(sleepTime);
        }
    }
}

module.exports = retry;