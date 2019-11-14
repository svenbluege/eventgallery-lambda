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

# Setup the lambda function

You can run the pack.cmd to create an install package for a new Lambda function. Make 
sure the new function has permission to read from the original bucket and write + 
putObjectACL to the thumbnail bucket. Create an API mapping so your function is usable via URL.

Even on Amazon Lambda the thumbnail creation takes a while. I recommend to set 1024MB to get enough CPU power.

Node 10.x does not longer support ImageMagik out of the box. But you can add image-magick.zip as a Lambda Layer to your function. You can build the layer yourself using https://github.com/serverlesspub/imagemagick-aws-lambda-2