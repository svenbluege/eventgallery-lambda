module.exports = {
    "bucketOriginals" : "eventgallery-images-eu-test-original",
    "bucketThumbnails" : "eventgallery-images-eu-test-resized",
    "autorotate": true,
    "sharpImage": true,
    "sharpOriginalImage": false,
    "doWatermark": true,
    "watermark" : {
        "src" : "https://www.svenbluege.de/images/SvenBluege-Photography-Logo.png"
    },
    //"sizes": [48, 104, 160, 288, 320, 400, 512, 640, 720, 800, 1024, 1280, 1440, 1600],
    "sizes": [48, 1600],
    "folder": "s3-test",
    "files": ["20151014_154834.jpg", "test_icc.jpg", "image_with_icc2.jpg"],
    "concurrency": 16,
    "savelocal": true
};