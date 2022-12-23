import {cleanETag, stream2buffer} from "./lib/util";
import {addIccProfile, getIccProfileFilePath} from "./lib/icc";
import {FORMAT_JPEG, getBufferOfImage, getExif, getImageType, identifyImage} from "./lib/image";
import {mapLimit} from "modern-async";


const {S3Client, GetObjectCommand, PutObjectCommand} = require("@aws-sdk/client-s3");
const imageMagick = require("gm").subClass({imageMagick: true})
const s3 = new S3Client({region: 'eu-central-1'})
const piExif = require("piexifjs");

let CONFIG = require("./config.json");

export async function resize(customSettings) {
    let defaults = {
        "region": "eu-central-1",
        "bucketOriginals": "",
        "bucketThumbnails": "",
        "autorotate": true,
        "sharpImage": true,
        "sharpOriginalImage": false,
        "doWatermark": false,
        "watermark": {
            "src": "",
            "margin": {
                "horizontal": 0,
                "vertical": 0
            },
            "opacity": 0,
            "position": "mc", //top middle bottom, left center right
            "mode": "prop", //prop, fill, fit
            "mode_prop": 50, // 50% of the image
            "thumbnailThreshold": 0 // don't apply a watermarkt to images smaller than this value
        },
        "sizes": [],
        "folder": "",
        "files": [],
        "sizeConcurrency": 1,
    }
    let settings = Object.assign({}, defaults, customSettings)
    let resultETags = {original: {}, thumbnails: {}};

    console.log(JSON.stringify(settings, null, 2));

    await Promise.all(settings.files.map(async (filename) => {

        const getObjectCommand = new GetObjectCommand({
            "Bucket": settings.bucketOriginals,
            "Key": settings.folder + '/' + filename
        })
        let originalImageS3Data = await s3.send(getObjectCommand);
        let originalImageDataBuffer: Buffer = await stream2buffer(originalImageS3Data.Body)
        let originalImage = await imageMagick(originalImageDataBuffer);

        console.log(filename, 'I have the original image now');

        let identifyData = await identifyImage(originalImage);

        console.log(filename, 'IdentifyData.format', identifyData.format)

        let iccProfileFilePath = await getIccProfileFilePath(originalImageDataBuffer);
        console.log(filename, `stored the icc profile in ${iccProfileFilePath}`)

        let imageType = getImageType(originalImageS3Data.ContentType);
        console.log(filename, `Identified the file as ${imageType}`);

        let exif = getExif(identifyData);
        console.log(filename, `Exif data: ${exif}`)

        resultETags.original[filename] = {
            'etag': cleanETag(originalImageS3Data.ETag),
            'size': identifyData.size,
            exif
        };

        let exifBytes = null;
        if (imageType === FORMAT_JPEG) {
            // save the metadata without thumbnail
            let data = originalImageDataBuffer.toString('binary');
            let exifObj = piExif.load(data);
            delete exifObj['thumbnail'];
            exifBytes = piExif.dump(exifObj);
            console.log(filename, 'removed thumbnail from exif data')
        }

        // reduce the parallel execution to avoid running out of memory.
        await mapLimit(settings.sizes, async (width) => {

            let thumbnailTargetWidth = width
            let originalImageWidth = identifyData.size.width;
            let thumbnail;

            thumbnail = imageMagick(originalImageDataBuffer);

            if (thumbnailTargetWidth < originalImageWidth) {
                thumbnail.resize(thumbnailTargetWidth);
                console.log(filename, width, `Resizing to size ${thumbnailTargetWidth} (original is ${originalImageWidth})`);
            } else {
                console.log(filename, width, `No resizing to ${thumbnailTargetWidth} because original image is only ${originalImageWidth}`)
            }

            if (settings.autorotate) {
                thumbnail.autoOrient();
            }

            if (settings.sharpImage) {
                let doSharp = true;

                if (thumbnailTargetWidth >= originalImage.width && !settings.sharpOriginalImage) {
                    doSharp = false;
                }

                if (doSharp) {
                    thumbnail.unsharp(CONFIG.unsharp.radius, CONFIG.unsharp.sigma, CONFIG.unsharp.amount, CONFIG.unsharp.threshold);
                    console.log(filename, width,  `Sharping with ` + JSON.stringify(CONFIG.unsharp));
                }
            }

            thumbnail.strip();

            // TODO: Watermarking currently only here as an example. Does not take the config into account.
            if (settings.doWatermark) {
                console.log(filename, width, "TODO: support watermarks");
                /*thumbnail = imageMagick(thumbnail).emboss
                    .composite(settings.watermark.src)
                    .geometry('+100+150')*/
            }

            if (iccProfileFilePath) {
                let thumbnailBuffer: Buffer = await getBufferOfImage(thumbnail)
                thumbnailBuffer = await addIccProfile(iccProfileFilePath, thumbnailBuffer)
                thumbnail = imageMagick(thumbnailBuffer)
                console.log(filename, width, 'Finished writing ICC profile');
            } else {
                console.log(filename, width, 'No ICC profile available')
            }

            let key = `${settings.folder}/s${width}/${filename}`;

            if (imageType == FORMAT_JPEG) {
                console.log(filename, width, 'Adding EXIF data');
                let thumbnailBuffer = await getBufferOfImage(thumbnail)
                let newData = piExif.insert(exifBytes, thumbnailBuffer.toString("binary"));
                thumbnailBuffer = Buffer.from(newData, "binary");
                thumbnail = imageMagick(thumbnailBuffer);
                thumbnailBuffer = null;
            }

            console.log(filename, width, `Uploading now to ${key}`);

            let putObjectCommand = new PutObjectCommand({
                "Bucket": settings.bucketThumbnails,
                "Key": key,
                "Body": await getBufferOfImage(thumbnail, 'JPEG'),
                "ContentType": 'image/jpeg',
                "ACL": "public-read"
            })

            let thumbnailS3Data = await s3.send(putObjectCommand);
            resultETags.thumbnails[filename] = resultETags.thumbnails[filename] || {};
            resultETags.thumbnails[filename][key] = cleanETag(thumbnailS3Data.ETag);

        }, settings.sizeConcurrency)

        console.log(filename, `Processing done`);
    }))

    return resultETags
}
