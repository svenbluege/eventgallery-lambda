# eventgallery-lambda
Amazon Lambda hosted image processor to calculate thumbnails from/to Amazon S3

# Local Test Setup

Install *ImageMagick* including the leagcy utilities.

Prepare the NodeJS stuff: 

    npm install  -g lambda-local
    npm install

 Create a file .profile which contains your aws access credentials

 ```
 [default]
aws_access_key_id=xxx
aws_secret_access_key=yyyy
 ```

 Make sure you use Linux line endings only.

 # Local Test Execution

 Copy .profile.sample to .profile and add your credentials. Then simply run ```run.cmd``` in the root project folder to execute the lambda function using the event specified in the event sample data folder.
