module.exports = {
    "bucketOriginals" : "eventgallery-images-test-original",
    "bucketThumbnails" : "eventgallery-images-test-resized",
    "autorotate": true,
    "sharpImage": true,
    "sharpOriginalImage": false,
    "doWatermark": false,
    "watermark" : {},
    "sizes": [48, 104, 160, 288, 320, 400, 512, 640, 720, 800, 1024, 1280, 1440, 1600],
    "folder": "s3-test",
    "files": ["image.jpg"],
    "concurrency": 4,
    "savelocal": true
};