var BotActions = {
    loadBotCommands: function () {
        var normalizedPath = require("path").join(__dirname, "../botActions");

        require("fs").readdirSync(normalizedPath).forEach(function (file) {
            var tmpFile = require(normalizedPath + '/' + file);
            BotActions.actions[tmpFile.commandName] = tmpFile;
        });
    },
    actions: {}
}

module.exports = BotActions;

BotActions.loadBotCommands();