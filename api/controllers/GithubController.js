/**
 * GithubController
 *
 * @description :: Server-side logic for managing githubs
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */
var Q = require("q");
var rp = require('request-promise');
var botConfig = sails.config.bot;

module.exports = {
    webhook: function (req, res) {
        var githubResponse = req.body;
        var isPR = (githubResponse.hasOwnProperty("pull_request") ? true : false);
        var isIssue = (githubResponse.hasOwnProperty("issue") ? true : false);
        var requestAction = githubResponse.action;
        var issue = {};
        if (isPR) {
            issue = githubResponse.pull_request;
        }
        if (isIssue) {
            issue = githubResponse.issue;
        }
        switch (requestAction) {
            //edited  if someone edited the issue check to see if the pivotal issue has what it should to be synced up
            case 'labeled':
                console.log("Label action triggered");
                PivotalService.addPivotalLabel(issue, githubResponse.label.name);
                break;
            case 'unlabeled':
                PivotalService.removePivotalLabels(issue.html_url, githubResponse.label.name);
                break;
            case 'assigned':
                PivotalService.assignPivotalUser(issue);
                break;
            case 'unassigned':
                var assignee = githubResponse.assignee.login;
                PivotalService.removeAssignedPivotalUser(assignee, issue.html_url);
                break;
            case 'closed':
                var isMerged = (issue.hasOwnProperty('merge_commit_sha')? true: false);
                if (isMerged){
                    PivotalService.closeIssue(issue);
                }
                break;
            case 'created':
            if (hasBotCommand(githubResponse.comment.body)) {
                    var botCommands = parseBotActions(githubResponse.comment.body);
                    botCommands.forEach(function (botCommand) {
                        sails.log.info("Running a bot command - "+ botCommand.command);
                        if (isValidBotCommand(botCommand.command)) {
                            BotActionsService.actions[botCommand.command].action(issue, botCommand.arguments);
                        }
                    });
                }
            break;
            case 'opened':
            case 'reopened':
                //    issue.body = " @ui-bot pv 137051013\n";
                if (isIssue) {
                    PivotalService.createIssue(issue).then(function(ticketData){
                         GithubService.createComment(issue.number, "Pivotal Ticket ID for this Issue \n\n "+ticketData.url);       
                    });
                }
                else {
                    if (hasBotCommand(issue.body)) {
                        var botCommands = parseBotActions(issue.body);
                        botCommands.forEach(function (botCommand) {
                            sails.log.info("Running a bot command - " + botCommand.command);
                            if (isValidBotCommand(botCommand.command)) {
                                BotActionsService.actions[botCommand.command].action(issue, botCommand.arguments);
                            }
                        });
                    }
                    else {
                        GithubService.createComment(issue.number, "Please be sure to provide a Pivotal Ticket ID as part of the PR description");
                    }
                }
                break;
        }
        // PivotalService.createIssue(githubResponse.pull_request);

        return res.json({
            todo: 'Not implemented yet!'
        });
        function isValidBotCommand(command){
            if (command in BotActionsService.actions){
                return true;
            }
            else{
                return false;
            }
        }
        function hasBotCommand(comment) {
            bot_regex = new RegExp('(@' + botConfig.username + ')\\s(\\w*)\\s(.*)', 'mg');
            bot_matches = comment.match(bot_regex)
            if (bot_matches) {
                return true;
            }
            else {
                return false;
            }
        }
        function parseBotActions(botText) {
            var commandList = [];
            var botRegexString = '(@' + botConfig.username + ')\\s(\\w*)\\s(.*)';
            var botRegex = new RegExp(botRegexString, 'mg');
            parseBotCmds = botText.match(botRegex);
            parseBotCmds.forEach(function (cmdText) {
                var commandRegex = new RegExp(botRegexString);
                var commandDetails = cmdText.match(commandRegex);
                var botCommand = {
                    "command": "",
                    "arguments": ""
                };
                botCommand.command = commandDetails[2];
                botCommand.arguments = commandDetails[3];
                commandList.push(botCommand);
            });
            
            return commandList;
        }
    }
};
