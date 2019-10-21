/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = function(controller) {

    controller.hears('what should we embrace?','message', async(bot, message) => {
        await bot.reply(message, 'Ambiguity, of course.');
    });

    /*
    controller.on('message', async(bot, message) => {
        await bot.reply(message, `Echo: ${ message.text }`);
    });
    */

}