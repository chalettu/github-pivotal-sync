module.exports = {
    commandName: "pv",
    action: function(request,args){
        PivotalService.linkPivotalTicket(args, request);
    }

}