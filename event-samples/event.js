module.exports = {
    "bucketOriginals" : "eventgallery-images-test-original",
    "bucketThumbnails" : "eventgallery-images-test-resized",
    "autorotate": true,
    "sharpImage": true,
    "sharpOriginalImage": false,
    "doWatermark": true,
    "watermark" : {},
    "sizes": [100, 500, 1000, 2050],
    "folder": "s3-test",
    "files": ["image.jpg"],
    "concurrency": 2
};