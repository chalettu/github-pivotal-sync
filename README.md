# github-pivotal-sync

Environmental Variables to set

if you want to test out locally you have the option to configure conf/config.json
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

PORT -> port number to run the webhook 

API_TOKEN -> Pivotal API Token

PROJECT -> Pivotal Project ID

SECRET -> Github webhook secret

When the webhook is up and running if you want to manually sync your pivotal tickets, enter 
@github-issue-sync as a comment in your issue and it will trigger a sync of that ticket. 

docker build -t chaleninja/github-pivotal-sync .
