# github-pivotal-sync

This app can be used to sync a Github repo with a Pivotal Tracker project.  It utilizes github webhooks and Pivotal REST API in order to communicate between systems.

## Installation

To develop and test locally, you must have Node installed.

Clone the Repo     
Run ```npm install```  
Once you have all the settings configured , to launch the app you can either type ``` npm start or node index.js ```

### Configure settings

This app supports either setting enviromental variables or using a config.json file to configure the settings  

conf/config.json
```
{
    "port": "7777",
    "pivotal": {
        "api_token": "1234",
        "project": "1234"
    },
    "secret":"blah"
}
```
If you want environment variables set  

**PORT** -> port number to run the webhook  
**API_TOKEN** -> Pivotal API Token   
**PROJECT** -> Pivotal Project ID  
**SECRET** -> Github webhook secret  
**USERS** -> JSON array of user mappings.  See below for format.  
The format of the file looks like this  

### Configure users
User mapping is done in the conf/users.json file  or can be done through environmental variables  

```
{
    "user_list":[
        {"github":"chalettu","email":"test@test.com"}
    ]
} 
```
The email address is the pivotal email address for the user you are wanting to map to.   

### Docker usage
This repo comes with a working DOCKERFILE and all you need to get it set up is run a docker build like below
docker build -t myDockerId/github-pivotal-sync .
docker run -dt myDockerId/github-pivotal-sync

### Testing the webhook
Since this uses a git webhook you need to be able to create one from your local box for testing.  My recommended approach is to install ngrok locally from http://ngrok.com and then run ```ngrok http 8080``` If you are running a different port than 8080 change it appropriately.  Take the URL it generates like http://f3170278.ngrok.io  and append **/webhook** to it .  Example - http://f3170278.ngrok.io/webhook.  Plug this in as a new webhook in your repo and you should be able to test it locally.  


## License

See [LICENSE.txt](LICENSE.txt)